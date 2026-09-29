import os
import io
import joblib
import numpy as np
import torch
import asyncio
from PIL import Image

try:
    from rembg import remove as rembg_remove
    REMBG_AVAILABLE = True
except ImportError:
    REMBG_AVAILABLE = False
    print("[AVISO] rembg no instalado. La segmentación previa al modelo estará desactivada.")

import hmac
from app.worker import embeddings as embeddings_worker
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(BASE_DIR, "..", "weights")
MODELS_DIR  = os.path.join(BASE_DIR, "..", "models")

os.environ["HF_HOME"] = MODELS_DIR

import open_clip

app = FastAPI(
    title="Anura AI Service",
    description="BioCLIP-based frog species classifier",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# El servidor liviano llega por HTTP (y por túnel cuando esté en Hostinger): sin token no se atiende.
MODEL_SERVICE_TOKEN = os.environ.get("MODEL_SERVICE_TOKEN", "")


@app.middleware("http")
async def require_model_token(request: Request, call_next):
    if MODEL_SERVICE_TOKEN and request.url.path != "/health":
        sent = request.headers.get("x-model-token", "")
        if not hmac.compare_digest(sent, MODEL_SERVICE_TOKEN):
            return JSONResponse({"detail": "Falta el token de model-service o no coincide."}, status_code=401)
    return await call_next(request)

# ─── CARGA DEL MODELO ────────────────────────────────────────────────────────
print("Cargando BioCLIP (ViT-H/14)...")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model, _, preprocess_val = open_clip.create_model_and_transforms(
    "hf-hub:imageomics/bioclip-2.5-vith14"
)
model.to(device).eval()
if device.type == "cuda":
    model = model.half()  # Convertir a Float16 permanente para mayor velocidad y menor memoria
    if hasattr(torch, 'compile'):
        try:
            model = torch.compile(model, mode="reduce-overhead")
            print("BioCLIP compilado con torch.compile()")
        except Exception as e:
            print(f"Aviso: torch.compile falló ({e}). Continuando sin compilación.")

with torch.no_grad(), torch.autocast(device_type=device.type):
    _dummy = torch.zeros(1, 3, 224, 224).to(device)
    if device.type == "cuda":
        _dummy = _dummy.half()
    model.encode_image(_dummy)
print(f"BioCLIP listo en {device}.")

# ─── FILTRO TAXONÓMICO (ANURA) ───────────────────────────────────────────────
tokenizer = open_clip.get_tokenizer("hf-hub:imageomics/bioclip-2.5-vith14")
with torch.no_grad():
    # Usamos el nombre del orden científico para máxima precisión en BioCLIP
    txt_tokens = tokenizer(["Anura", "object", "animal"]).to(device)
    txt_feats  = model.encode_text(txt_tokens)
    txt_feats /= txt_feats.norm(dim=-1, keepdim=True)
    anura_text_feat = txt_feats[0:1] # Primer vector: "Anura"

TAXONOMIC_THRESHOLD = 0.10 # Umbral de similitud para descartar no-ranas

# ─── CARGA DEL CLASIFICADOR ──────────────────────────────────────────────────
CUSTOM_MODEL_PATH = os.path.join(WEIGHTS_DIR, "custom_model.pkl")
clf = le = geo_features = None
loc_weight = 0.0

try:
    model_data   = joblib.load(CUSTOM_MODEL_PATH)
    clf          = model_data["classifier"]
    le           = model_data["label_encoder"]
    geo_features = model_data.get("geo_features", None)
    loc_weight   = model_data.get("loc_weight", 0.0)
    
    # Parche para compatibilidad de versiones de scikit-learn
    if not hasattr(clf, 'multi_class'):
        clf.multi_class = 'multinomial'
        
    print(f"Clasificador cargado. Clases: {list(le.classes_)}")
except Exception as e:
    print(f"[!] Error cargando clasificador: {e}")
    print("    Ejecuta primero: python training/train_finetune.py")

NO_FROG_LABEL = "no_frog"
prediction_semaphore = asyncio.Semaphore(2)  # Permite 2 requests concurrentes en lugar de bloquear todo


# ─── SEGMENTACIÓN ────────────────────────────────────────────────────────────
def segment_and_crop(img: Image.Image) -> Image.Image:
    """
    Aplica rembg para quitar el fondo de la imagen.
    Usa la máscara binaria (canal alpha > 50) para aislar el sujeto:
    los píxeles con máscara=0 se ponen en negro, los de máscara=1 se conservan.
    Devuelve una imagen RGB lista para BioCLIP.
    Si rembg no está disponible o falla, devuelve la imagen original.
    """
    if not REMBG_AVAILABLE:
        return img
    try:
        img_sin_fondo = rembg_remove(img)          # → RGBA con alpha=0 en fondo
        img_array     = np.array(img_sin_fondo)
        canal_alpha   = img_array[:, :, 3]          # canal alpha
        mascara       = (canal_alpha > 50)           # True = sujeto, False = fondo

        # Aplicar máscara: poner en negro los píxeles de fondo
        img_rgb = img_array[:, :, :3].copy()
        img_rgb[~mascara] = 0                        # fondo → negro

        return Image.fromarray(img_rgb, 'RGB')
    except Exception as e:
        print(f"[AVISO] Segmentación falló, usando imagen original: {e}")
        return img


MAX_DIM_FOR_REMBG = 1024

def smart_resize(img: Image.Image, max_dim: int = MAX_DIM_FOR_REMBG) -> Image.Image:
    """Reduce la imagen antes de rembg para acelerar la segmentación."""
    w, h = img.size
    if max(w, h) <= max_dim:
        return img
    ratio = max_dim / max(w, h)
    new_size = (int(w * ratio), int(h * ratio))
    return img.resize(new_size, Image.LANCZOS)

# ─── HELPERS ─────────────────────────────────────────────────────────────────
def get_location_score(species: str, lat: float, lon: float) -> float:
    if geo_features is None or lat is None or lon is None:
        return 1.0
    feat = geo_features.get(species)
    if feat is None:
        for key in geo_features:
            if key in species or species in key:
                feat = geo_features[key]
                break
    if feat is None:
        return 1.0
    lat_mean, lon_mean, lat_std, lon_std = feat
    lat_std = max(float(lat_std), 0.5)
    lon_std = max(float(lon_std), 0.5)
    lat_score = np.exp(-0.5 * ((lat - lat_mean) / lat_std) ** 2)
    lon_score = np.exp(-0.5 * ((lon - lon_mean) / lon_std) ** 2)
    return float(lat_score * lon_score)


def build_feature_vector(emb: np.ndarray, loc: np.ndarray) -> np.ndarray:
    return np.concatenate([emb, loc * loc_weight])


# ─── RUTAS ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def warmup():
    print("Iniciando warm-up de modelos...")
    dummy = torch.zeros(1, 3, 224, 224).to(device)
    if device.type == "cuda":
        dummy = dummy.half()
    with torch.no_grad(), torch.autocast(device_type=device.type):
        model.encode_image(dummy)
    
    if REMBG_AVAILABLE:
        dummy_img = Image.new("RGB", (256, 256), (128, 128, 128))
        segment_and_crop(dummy_img)
    print("✅ Warm-up completo: BioCLIP + rembg listos")
    # M2: worker de embeddings (pide trabajos a dataset-service; no abre puertos).
    print(f"Worker de embeddings: {embeddings_worker.iniciar()}")


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "bioclip": "loaded",
        "classifier": "loaded" if clf is not None else "not_loaded",
        "classes": list(le.classes_) if le is not None else [],
        "device": str(device),
        "gbif_species": len(geo_features) if geo_features else 0,
        "worker": embeddings_worker.estado(),
    }


@app.post("/api/predict")
async def predict(
    image: UploadFile = File(...),
    lat: float | None = Form(None),
    lon: float | None = Form(None),
):
    if clf is None or le is None:
        raise HTTPException(
            status_code=503,
            detail="Clasificador no cargado. Ejecuta training/train_finetune.py primero.",
        )

    try:
        async with prediction_semaphore:
            contents = await image.read()
            img_original = Image.open(io.BytesIO(contents)).convert("RGB")

            # ── Redimensionar antes de segmentar para acelerar rembg ──────
            img_resized = smart_resize(img_original)

            # ── Segmentación previa: quitar fondo para mejorar análisis ──────
            # La imagen recortada va al modelo; la original se guarda en la BD
            img = segment_and_crop(img_resized)
            if REMBG_AVAILABLE:
                print("DEBUG: Utilizando la imagen segmentada (sin fondo) para la predicción de la IA.")
            else:
                print("DEBUG: rembg no disponible. Utilizando imagen original (con fondo) para la predicción.")

            inp = preprocess_val(img).unsqueeze(0).to(device)

            with torch.no_grad(), torch.autocast(device_type=device.type):
                feats = model.encode_image(inp)
                feats = feats / feats.norm(dim=-1, keepdim=True)

                # --- VALIDACIÓN TAXONÓMICA ---
                # Comparamos el embedding de la imagen con el del orden "Anura"
                tax_sim = (feats @ anura_text_feat.T).item()
                print(f"DEBUG: Similitud con Anura: {tax_sim:.4f}")

                if tax_sim < TAXONOMIC_THRESHOLD:
                    print(f"FILTRADO: Imagen descartada por baja similitud taxonómica ({tax_sim:.4f} < {TAXONOMIC_THRESHOLD})")
                    return {
                        "predictions": [{
                            "class": NO_FROG_LABEL,
                            "probability": 1.0,
                            "is_frog": False,
                            "location_score": 0.0
                        }],
                        "best_class": NO_FROG_LABEL,
                        "best_prob": 1.0,
                        "is_frog": False,
                        "location_used": False,
                        "taxonomic_similarity": tax_sim
                    }

            emb = feats.cpu().to(torch.float32).numpy().squeeze()

            if lat is not None and lon is not None:
                loc = np.array([lat, lon, 0.5, 0.5], dtype=np.float32)
            else:
                loc = np.zeros(4, dtype=np.float32)

            feat_vec = build_feature_vector(emb, loc)
            probs    = clf.predict_proba([feat_vec])[0]

            # Ajuste geográfico suave
            if lat is not None and lon is not None:
                adjusted = probs.copy()
                for i, cname in enumerate(le.classes_):
                    if cname != NO_FROG_LABEL:
                        score = get_location_score(cname, lat, lon)
                        adjusted[i] *= (0.5 + 0.5 * score)
                total = adjusted.sum()
                if total > 0:
                    probs = adjusted / total

            top_indices = probs.argsort()[::-1][:5]
            results = []
            for idx in top_indices:
                cname = le.classes_[idx]
                prob  = float(probs[idx])
                loc_score = get_location_score(cname, lat, lon) if lat is not None else None
                results.append({
                    "class":          str(cname),
                    "probability":    prob,
                    "is_frog":        cname != NO_FROG_LABEL,
                    "location_score": loc_score,
                })

            best = results[0]
            return {
                "predictions":   results,
                "best_class":    best["class"],
                "best_prob":     best["probability"],
                "is_frog":       best["is_frog"],
                "location_used": lat is not None and lon is not None,
            }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
