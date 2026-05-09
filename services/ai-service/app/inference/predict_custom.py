"""
predict_custom.py — Predicción con BioCLIP + Localización
==========================================================
Uso:
    python app/inference/predict_custom.py <ruta_imagen>
    python app/inference/predict_custom.py <ruta_imagen> --lat 4.5 --lon -75.3

Opciones:
    --lat   Latitud del punto de observación (mejora predicción con GBIF)
    --lon   Longitud del punto de observación (mejora predicción con GBIF)
"""

import os
import sys
import argparse
import torch
import numpy as np
from PIL import Image
import open_clip
import joblib

# ─── CONFIGURACIÓN ──────────────────────────────────────────────────────────
# inference/ -> app/ -> ai-service/
SERVICE_DIR     = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_SAVE_PATH = os.path.join(SERVICE_DIR, "weights", "custom_model.pkl")
os.environ["HF_HOME"] = os.path.join(SERVICE_DIR, "models")
# ─────────────────────────────────────────────────────────────────────────────

# Etiqueta de clase "no es rana"
NO_FROG_LABEL = "no_frog"


def get_location_score(species: str, geo_features: dict,
                        lat: float, lon: float) -> float:
    """
    Calcula qué tan cerca está el punto (lat, lon) del rango de distribución
    conocido para la especie (usando datos GBIF). Devuelve score 0-1.
    """
    if geo_features is None or lat is None or lon is None:
        return 1.0  # sin info de localización, no penalizar

    feat = None
    if species in geo_features:
        feat = geo_features[species]
    else:
        for key in geo_features:
            if key in species or species in key:
                feat = geo_features[key]
                break

    if feat is None:
        return 1.0  # especie sin datos GBIF → no penalizar

    lat_mean, lon_mean, lat_std, lon_std = feat

    # Score basado en distancia gaussiana (1 = dentro del rango típico)
    lat_std = max(lat_std, 0.5)
    lon_std = max(lon_std, 0.5)
    lat_score = np.exp(-0.5 * ((lat - lat_mean) / lat_std) ** 2)
    lon_score = np.exp(-0.5 * ((lon - lon_mean) / lon_std) ** 2)

    return float(lat_score * lon_score)


def build_feature_vector(emb: np.ndarray, loc: np.ndarray,
                          loc_weight: float = 0.05) -> np.ndarray:
    return np.concatenate([emb, loc * loc_weight])


def main():
    parser = argparse.ArgumentParser(
        description="Predice la especie de rana en una imagen con BioCLIP"
    )
    parser.add_argument("image_path", help="Ruta a la imagen a predecir")
    parser.add_argument("--lat", type=float, default=None,
                        help="Latitud del punto de observación (opcional)")
    parser.add_argument("--lon", type=float, default=None,
                        help="Longitud del punto de observación (opcional)")
    parser.add_argument("--top", type=int, default=5,
                        help="Número de predicciones top a mostrar (default: 5)")
    args = parser.parse_args()

    # ── Validaciones ──────────────────────────────────────────────────────────
    if not os.path.exists(args.image_path):
        print(f"Error: imagen no encontrada en '{args.image_path}'")
        sys.exit(1)

    if not os.path.exists(MODEL_SAVE_PATH):
        print(f"Error: modelo no encontrado en '{MODEL_SAVE_PATH}'.")
        print("Ejecuta primero: python training/train_finetune.py")
        sys.exit(1)

    # ── Cargar modelo ─────────────────────────────────────────────────────────
    print("Cargando BioCLIP (ViT-H/14)...")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model, _, preprocess = open_clip.create_model_and_transforms(
        'hf-hub:imageomics/bioclip-2.5-vith14'
    )
    model.to(device).eval()

    print("Cargando clasificador personalizado...")
    model_data  = joblib.load(MODEL_SAVE_PATH)
    clf         = model_data["classifier"]
    le          = model_data["label_encoder"]
    geo_features = model_data.get("geo_features", None)
    loc_weight  = model_data.get("loc_weight", 0.05)

    # ── Extraer embedding ─────────────────────────────────────────────────────
    print(f"Analizando imagen: {args.image_path}")
    image = Image.open(args.image_path).convert("RGB")
    inp   = preprocess(image).unsqueeze(0).to(device)

    with torch.no_grad(), torch.autocast(device_type=device.type):
        feats = model.encode_image(inp)
        feats = feats / feats.norm(dim=-1, keepdim=True)

    emb = feats.cpu().to(torch.float32).numpy().squeeze()

    # Vector de localización para inferencia
    loc = np.zeros(4, dtype=np.float32)
    if args.lat is not None and args.lon is not None:
        # Aproximamos con valores del usuario
        loc = np.array([args.lat, args.lon, 0.5, 0.5], dtype=np.float32)

    feature_vector = build_feature_vector(emb, loc, loc_weight)

    # ── Predicción ───────────────────────────────────────────────────────────
    probs = clf.predict_proba([feature_vector])[0]

    # Ajuste por localización (multiplicativo suave)
    if args.lat is not None and args.lon is not None:
        loc_adjusted = probs.copy()
        for i, class_name in enumerate(le.classes_):
            if class_name != NO_FROG_LABEL:
                loc_score = get_location_score(
                    class_name, geo_features, args.lat, args.lon
                )
                loc_adjusted[i] *= (0.5 + 0.5 * loc_score)  # soft adjustment
        # Re-normalizar
        total = loc_adjusted.sum()
        if total > 0:
            probs = loc_adjusted / total

    top_indices = probs.argsort()[::-1][:args.top]

    # ── Mostrar resultados ────────────────────────────────────────────────────
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║              RESULTADOS DE PREDICCIÓN                ║")
    print("╠══════════════════════════════════════════════════════╣")

    best_label = le.classes_[top_indices[0]]
    if best_label == NO_FROG_LABEL:
        print("║  ⚠️  No se detectó ninguna rana en la imagen         ║")
    else:
        print(f"║  ✅ Especie más probable: {best_label:<27}║")

    if args.lat is not None:
        print(f"║  📍 Localización: ({args.lat:.3f}, {args.lon:.3f})               ║")

    print("╠══════════════════════════════════════════════════════╣")
    print("║  Top predicciones:                                    ║")

    for rank, idx in enumerate(top_indices, 1):
        class_name  = le.classes_[idx]
        confidence  = probs[idx] * 100
        bar_len     = int(confidence / 5)
        bar         = "█" * bar_len + "░" * (20 - bar_len)
        print(f"║  {rank}. {class_name:<28} {bar} {confidence:5.1f}% ║")

    print("╚══════════════════════════════════════════════════════╝")


if __name__ == '__main__':
    main()
