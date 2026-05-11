import os
import io
import joblib
import numpy as np
import torch
from PIL import Image

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

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

# ─── CARGA DEL MODELO ────────────────────────────────────────────────────────
print("Cargando BioCLIP (ViT-H/14)...")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model, _, preprocess_val = open_clip.create_model_and_transforms(
    "hf-hub:imageomics/bioclip-2.5-vith14"
)
model.to(device).eval()

with torch.no_grad():
    _dummy = torch.zeros(1, 3, 224, 224).to(device)
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

TAXONOMIC_THRESHOLD = 0.18 # Umbral de similitud para descartar no-ranas

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
        contents = await image.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
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
