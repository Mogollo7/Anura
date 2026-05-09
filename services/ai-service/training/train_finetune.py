# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
"""
train_finetune.py - BioCLIP-2.5 ViT-H/14 Fine-Tuning Pipeline
================================================================
Caracteristicas:
  - Corrige rutas del JSON (D:/ a ruta real en C:/)
  - Integra features de localizacion GBIF (lat/lon centroide por especie)
  - Falsos positivos sinteticos (rocas, hojas, otros animales -> clase 'no_frog')
  - Augmentacion de datos (albumentations)
  - Cross-Validation estratificada (5-fold) para seleccion del mejor modelo
  - Entrenamiento final con 75/25 split
  - MLflow tracking (experimentos, metricas, artefactos)
  - Reporte completo de Accuracy + classification_report
"""

import os
import json
import glob
import math
import random
import time
import torch
import numpy as np
import joblib
import cv2
from PIL import Image
import open_clip
import albumentations as A
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import classification_report, accuracy_score
from collections import defaultdict

# ─── MLflow (opcional pero recomendado) ─────────────────────────────────────
try:
    import mlflow
    import mlflow.sklearn
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False
    print("[Warning] MLflow no instalado. Ejecuta: pip install mlflow")

# ─── CONFIGURACIÓN ──────────────────────────────────────────────────────────
# training/ -> ai-service/ -> services/ -> repo root
REPO_ROOT       = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SERVICE_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # ai-service/

# Rutas del monorepo
IMAGES_ROOT     = os.path.join(REPO_ROOT, "datasets", "raw")
JSON_PATH       = os.path.join(REPO_ROOT, "datasets", "labeled", "pre_annotated_dataset.json")
MODEL_SAVE_PATH = os.path.join(SERVICE_DIR, "weights", "custom_model.pkl")
CACHE_PATH      = os.path.join(SERVICE_DIR, "weights", "features_cache.pkl")
GBIF_ROOT       = os.path.join(SERVICE_DIR, "app", "contextual", "PAIS")
OS_MODELS_PATH  = os.path.join(SERVICE_DIR, "models")
os.environ["HF_HOME"] = OS_MODELS_PATH

# Hiperparámetros
TRAIN_SPLIT     = 0.75      # 75% train / 25% val
AUG_REPEATS     = 3         # copias aumentadas por imagen de entrenamiento
SAVE_EVERY      = 25        # auto-guardar caché cada N imágenes
CV_FOLDS        = 5         # folds para cross-validation
CV_C_VALUES     = [0.1, 1.0, 4.0, 10.0]  # valores C para buscar en CV

# Falsos positivos
NO_FROG_LABEL   = "no_frog"     # etiqueta para clase "no es rana"
NO_FROG_RATIO   = 0.15          # 15% de imágenes totales como falsos positivos

# MLflow
MLFLOW_EXPERIMENT = "BioCLIP-Anura"
MLFLOW_URI        = os.path.join(SERVICE_DIR, "weights", "mlruns")

# ─── AUGMENTACIÓN ────────────────────────────────────────────────────────────
AUGMENT = A.Compose([
    A.HorizontalFlip(p=0.5),
    A.VerticalFlip(p=0.3),
    A.RandomRotate90(p=0.5),
    A.ShiftScaleRotate(shift_limit=0.2, scale_limit=0.2, rotate_limit=30, p=0.5),
    A.ElasticTransform(alpha=120, sigma=6, p=0.3),
    A.GridDistortion(p=0.2),
    A.Perspective(p=0.3),
    A.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.1, p=0.4),
    A.GaussianBlur(blur_limit=3, p=0.2),
])


def augment_pil(pil_image: Image.Image, n: int = 1):
    """Devuelve n versiones aumentadas de una imagen PIL."""
    img_np = np.array(pil_image)
    results = []
    for _ in range(n):
        augmented = AUGMENT(image=img_np)["image"]
        results.append(Image.fromarray(augmented))
    return results


# ─── CORRECCIÓN DE RUTAS ─────────────────────────────────────────────────────
def fix_path(raw_path: str) -> str:
    """
    Convierte rutas del JSON (D:/user/Downloads/.../Datos Crudos label/...) a la
    ruta real dentro de IMAGES_ROOT (C:/.../Datos Crudos label/...).
    """
    if not raw_path:
        return ""

    # Normalizar separadores
    raw_path = raw_path.replace("\\", "/").replace("file:///", "")

    # Buscar el segmento "Datos Crudos label" en la ruta
    marker = "Datos Crudos label/"
    idx = raw_path.find(marker)
    if idx != -1:
        relative = raw_path[idx + len(marker):]
        # FIX: The JSON has 'Strabomantidae' but folder is 'Craugastoridae'
        relative = relative.replace("Strabomantidae", "Craugastoridae")
        return os.path.join(IMAGES_ROOT, relative.replace("/", os.sep))

    # Si ya empieza con C: y contiene Datos Crudos label, podria ser valida
    if os.path.exists(raw_path):
        return raw_path

    return ""


# ─── CARGA DE DATASET ────────────────────────────────────────────────────────
def load_dataset(json_path: str):
    """
    Lee el JSON de Label Studio y extrae (ruta_imagen, especie).
    Corrige automáticamente las rutas a la ubicación real en C:/.
    """
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    image_paths, labels = [], []
    skipped = 0

    for item in data:
        # Intentar obtener ruta de 'original_path' primero, luego 'image'
        raw1 = item.get("data", {}).get("original_path", "")
        raw2 = item.get("data", {}).get("image", "")

        full_path = fix_path(raw1) or fix_path(raw2)

        if not full_path or not os.path.exists(full_path):
            skipped += 1
            continue

        annotations = item.get("annotations", [])
        if not annotations:
            continue
        results = annotations[0].get("result", [])
        if not results:
            continue
        taxonomy = results[0].get("value", {}).get("taxonomy", [])
        if not taxonomy:
            continue

        # Última categoría del árbol taxonómico = especie
        final_label = taxonomy[0][-1]
        image_paths.append(full_path)
        labels.append(final_label)

    if skipped > 0:
        print(f"  [Info] {skipped} entradas del JSON ignoradas (ruta no encontrada).")

    return image_paths, labels


# ─── LOCALIZACIÓN GBIF ───────────────────────────────────────────────────────
def load_gbif_features(gbif_root: str) -> dict:
    """
    Carga los JSON de GBIF y calcula el centroide (lat_mean, lon_mean, lat_std, lon_std)
    por especie. Devuelve dict: {especie_nombre -> np.array([lat_mean, lon_mean, lat_std, lon_std])}.
    """
    species_coords = defaultdict(list)

    for json_file in glob.glob(os.path.join(gbif_root, "**", "*.json"), recursive=True):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                records = json.load(f)
            for rec in records:
                lat = rec.get("decimalLatitude")
                lon = rec.get("decimalLongitude")
                sci = rec.get("scientificName", "")
                if lat is not None and lon is not None and sci:
                    # Usar solo el binomial (2 primeras palabras)
                    binomial = " ".join(sci.split()[:2])
                    species_coords[binomial].append((lat, lon))
        except Exception:
            pass

    geo_features = {}
    for species, coords in species_coords.items():
        lats = [c[0] for c in coords]
        lons = [c[1] for c in coords]
        geo_features[species] = np.array([
            np.mean(lats), np.mean(lons),
            np.std(lats),  np.std(lons)
        ], dtype=np.float32)

    print(f"  [GBIF] Localización cargada para {len(geo_features)} especies.")
    return geo_features


def get_location_feature(species: str, geo_features: dict) -> np.ndarray:
    """
    Devuelve el vector de localización (4-dim) para la especie dada.
    Si no hay datos GBIF, devuelve ceros.
    """
    # Búsqueda exacta, luego parcial
    if species in geo_features:
        return geo_features[species]
    for key in geo_features:
        if key in species or species in key:
            return geo_features[key]
    return np.zeros(4, dtype=np.float32)


# ─── FALSOS POSITIVOS ────────────────────────────────────────────────────────
def collect_false_positives(n_total: int) -> list:
    """
    Intenta encontrar imágenes de falsos positivos (rocas, hojas, otros animales)
    dentro de la carpeta IMAGES_ROOT si existe una subcarpeta 'no_frog'.
    En caso contrario genera imágenes sintéticas de ruido/textura.
    Devuelve lista de objetos PIL.Image.
    """
    n_fp = max(1, int(n_total * NO_FROG_RATIO))
    fps = []

    # 1) Buscar carpeta no_frog dentro del dataset
    no_frog_dir = os.path.join(IMAGES_ROOT, "no_frog")
    if os.path.isdir(no_frog_dir):
        candidates = []
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            candidates.extend(glob.glob(os.path.join(no_frog_dir, "**", ext), recursive=True))
        random.shuffle(candidates)
        for p in candidates[:n_fp]:
            try:
                fps.append(Image.open(p).convert("RGB"))
            except Exception:
                pass

    # 2) Completar con imágenes sintéticas si faltan
    while len(fps) < n_fp:
        # Fondo aleatorio (simula textura de roca/hoja)
        base_color = np.random.randint(30, 180, 3, dtype=np.uint8)
        noise = np.random.randint(-40, 40, (224, 224, 3), dtype=np.int16)
        img_np = np.clip(base_color.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        # Agregar patrón aleatorio
        for _ in range(random.randint(3, 12)):
            x1, y1 = random.randint(0, 200), random.randint(0, 200)
            x2, y2 = x1 + random.randint(5, 50), y1 + random.randint(5, 50)
            color = tuple(random.randint(0, 255) for _ in range(3))
            cv2.rectangle(img_np, (x1, y1), (x2, y2), color, -1)
        fps.append(Image.fromarray(img_np))

    print(f"  [FP] Falsos positivos preparados: {len(fps)} imágenes (clase '{NO_FROG_LABEL}').")
    return fps[:n_fp]


# ─── EXTRACCIÓN DE EMBEDDINGS ────────────────────────────────────────────────
def extract_embeddings(image_list, model, preprocess, device):
    """Extrae embeddings L2-normalizados de una lista de PIL images."""
    embeddings = []
    with torch.no_grad():
        for img in image_list:
            inp = preprocess(img).unsqueeze(0).to(device)
            with torch.autocast(device_type=device.type):
                feats = model.encode_image(inp)
                feats = feats / feats.norm(dim=-1, keepdim=True)
            embeddings.append(feats.cpu().to(torch.float32).numpy().squeeze())
    return embeddings


def build_feature_vector(emb: np.ndarray, loc: np.ndarray,
                          loc_weight: float = 0.0) -> np.ndarray:
    """
    Concatena embedding visual + vector de localización ponderado.
    El peso bajo (0.05) asegura que la localización sea información
    complementaria, no dominante.
    """
    return np.concatenate([emb, loc * loc_weight])


# ─── CROSS-VALIDATION ────────────────────────────────────────────────────────
def cross_validate(X: np.ndarray, y: np.ndarray, label_names,
                   c_values=CV_C_VALUES, n_folds=CV_FOLDS) -> float:
    """
    StratifiedKFold CV para encontrar el mejor C de LogisticRegression.
    Devuelve el mejor C.
    """
    print(f"\n{'='*60}")
    print(f"  Cross-Validation ({n_folds}-fold, buscando C optimo)...")
    print(f"  Candidatos: {c_values}")

    best_c, best_acc = CV_C_VALUES[0], 0.0
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)

    cv_results = {}
    for c in c_values:
        fold_accs = []
        for fold_i, (tr_idx, va_idx) in enumerate(skf.split(X, y)):
            clf_cv = LogisticRegression(max_iter=1000, C=c, solver='lbfgs')
            clf_cv.fit(X[tr_idx], y[tr_idx])
            acc_fold = accuracy_score(y[va_idx], clf_cv.predict(X[va_idx]))
            fold_accs.append(acc_fold)
        mean_acc = float(np.mean(fold_accs))
        std_acc  = float(np.std(fold_accs))
        cv_results[c] = {"mean": mean_acc, "std": std_acc}
        print(f"    C={c:<6}  acc={mean_acc*100:.2f}% +/- {std_acc*100:.2f}%")
        if mean_acc > best_acc:
            best_acc = mean_acc
            best_c   = c

    print(f"  [BEST] C={best_c}  (CV acc={best_acc*100:.2f}%)")
    print(f"{'='*60}")
    return best_c, cv_results


# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    random.seed(42)
    np.random.seed(42)

    # ── MLflow setup ─────────────────────────────────────────────────────────
    if MLFLOW_AVAILABLE:
        mlflow.set_tracking_uri(f"file:///{MLFLOW_URI.replace(os.sep, '/')}")
        mlflow.set_experiment(MLFLOW_EXPERIMENT)
        run = mlflow.start_run(run_name=f"train_{time.strftime('%Y%m%d_%H%M%S')}")
        mlflow.log_param("model", "bioclip-2.5-vith14")
        mlflow.log_param("aug_repeats", AUG_REPEATS)
        mlflow.log_param("train_split", TRAIN_SPLIT)
        mlflow.log_param("cv_folds", CV_FOLDS)
        mlflow.log_param("no_frog_ratio", NO_FROG_RATIO)
        print(f"[MLflow] Experimento: {MLFLOW_EXPERIMENT}")
        print(f"[MLflow] Run ID: {run.info.run_id}")

    # ── 1. Cargar dataset ─────────────────────────────────────────────────────
    print("\n1. Cargando Dataset JSON...")
    print(f"   Imágenes en: {IMAGES_ROOT}")
    image_paths, labels = load_dataset(JSON_PATH)

    # Filtrar existentes
    valid_paths, valid_labels = [], []
    for p, l in zip(image_paths, labels):
        if os.path.exists(p):
            valid_paths.append(p)
            valid_labels.append(l)
        else:
            print(f"   [!] No encontrado: {p}")

    if not valid_paths:
        print("\nERROR: No se encontraron imágenes válidas.")
        print(f"Verifica que la carpeta exista: {IMAGES_ROOT}")
        if MLFLOW_AVAILABLE:
            mlflow.end_run("FAILED")
        return

    species_list = sorted(set(valid_labels))
    print(f"   {len(valid_paths)} imágenes válidas | {len(species_list)} especies: {species_list}")

    # ── 2. Cargar localización GBIF ───────────────────────────────────────────
    print("\n2. Cargando Features de Localización GBIF...")
    geo_features = load_gbif_features(GBIF_ROOT)

    # ── 3. Cargar BioCLIP ─────────────────────────────────────────────────────
    print("\n3. Cargando BioCLIP (ViT-H/14)...")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"   Device: {device}")
    model, _, preprocess = open_clip.create_model_and_transforms(
        'hf-hub:imageomics/bioclip-2.5-vith14'
    )
    model.to(device).eval()

    # ── 4. Falsos positivos ───────────────────────────────────────────────────
    print("\n4. Preparando Falsos Positivos...")
    fp_images = collect_false_positives(len(valid_paths))

    # ── 5. Extraer embeddings (con caché) ────────────────────────────────────
    cache = {"processed": {}}
    if os.path.exists(CACHE_PATH):
        try:
            cache = joblib.load(CACHE_PATH)
            print(f"\n5. Caché cargado: {len(cache['processed'])} imágenes procesadas.")
        except Exception as e:
            print(f"   [!] No se pudo cargar caché ({e}). Iniciando desde cero.")

    print(f"\n5. Extrayendo Embeddings ({len(valid_paths)} imágenes + FP)...")
    all_embs, all_labels = [], []

    # Imágenes reales
    for i, (path, label) in enumerate(zip(valid_paths, valid_labels)):
        loc = get_location_feature(label, geo_features)

        if path in cache["processed"]:
            for emb in cache["processed"][path]["embs"]:
                all_embs.append(build_feature_vector(emb, loc))
                all_labels.append(label)
            continue

        print(f"  [{i+1}/{len(valid_paths)}] {os.path.basename(path)}")
        try:
            pil = Image.open(path).convert("RGB")
            versions = [pil] + augment_pil(pil, AUG_REPEATS)
            embs = extract_embeddings(versions, model, preprocess, device)

            cache["processed"][path] = {"embs": embs}
            for emb in embs:
                all_embs.append(build_feature_vector(emb, loc))
                all_labels.append(label)

            if (i + 1) % SAVE_EVERY == 0:
                joblib.dump(cache, CACHE_PATH)
                print(f"    [Autoguardado] {i+1}/{len(valid_paths)}")
        except Exception as e:
            print(f"  [Error] {path}: {e}")

    # Falsos positivos
    loc_fp = np.zeros(4, dtype=np.float32)
    fp_embs = extract_embeddings(fp_images, model, preprocess, device)
    for emb in fp_embs:
        all_embs.append(build_feature_vector(emb, loc_fp))
        all_labels.append(NO_FROG_LABEL)

    joblib.dump(cache, CACHE_PATH)

    X_all = np.array(all_embs)
    y_all_raw = all_labels

    print(f"\n   Total muestras: {len(X_all)} "
          f"({len(X_all) - len(fp_embs)} ranas + {len(fp_embs)} no_frog)")

    # ── 6. Label Encoding ─────────────────────────────────────────────────────
    le = LabelEncoder()
    y_all = le.fit_transform(y_all_raw)
    print(f"   Clases ({len(le.classes_)}): {list(le.classes_)}")

    if MLFLOW_AVAILABLE:
        mlflow.log_param("n_classes", len(le.classes_))
        mlflow.log_param("n_samples_total", len(X_all))
        mlflow.log_param("n_false_positives", len(fp_embs))

    # ── 7. Cross-Validation para mejor C ─────────────────────────────────────
    best_c, cv_results = cross_validate(X_all, y_all, le.classes_)

    if MLFLOW_AVAILABLE:
        mlflow.log_param("best_C", best_c)
        for c_val, metrics in cv_results.items():
            mlflow.log_metric(f"cv_acc_C{c_val}", metrics["mean"])

    # ── 8. Split train/val final ──────────────────────────────────────────────
    print("\n8. Split Train/Val Final (75/25)...")
    X_train, X_val, y_train, y_val = train_test_split(
        X_all, y_all,
        test_size=(1 - TRAIN_SPLIT),
        stratify=y_all,
        random_state=42
    )
    print(f"   Train: {len(X_train)} | Val: {len(X_val)}")

    # ── 9. Entrenamiento final ────────────────────────────────────────────────
    print(f"\n9. Entrenando Clasificador Final (C={best_c})...")
    clf = LogisticRegression(max_iter=2000, C=best_c, solver='lbfgs')
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_val)
    acc    = accuracy_score(y_val, y_pred)

    print(f"\n{'='*60}")
    print(f"  Accuracy en Validación: {acc*100:.2f}%")
    print(f"{'='*60}")
    report = classification_report(y_val, y_pred, target_names=le.classes_)
    print(report)

    if MLFLOW_AVAILABLE:
        mlflow.log_metric("val_accuracy", acc)
        # Log report como archivo
        report_path = os.path.join(REPO_ROOT, "docs", "architecture", "classification_report.txt")
        with open(report_path, "w") as f:
            f.write(f"Validation Accuracy: {acc*100:.2f}%\n\n")
            f.write(report)
        mlflow.log_artifact(report_path)

    # ── 10. Guardar modelo ────────────────────────────────────────────────────
    print("\n10. Guardando Modelo...")
    model_data = {
        "classifier": clf,
        "label_encoder": le,
        "geo_features": geo_features,
        "loc_weight": 0.0,
        "best_c": best_c,
        "val_accuracy": acc,
        "classes": list(le.classes_),
    }
    joblib.dump(model_data, MODEL_SAVE_PATH)
    print(f"    Guardado → {MODEL_SAVE_PATH}")

    if MLFLOW_AVAILABLE:
        mlflow.sklearn.log_model(clf, "logistic_regression")
        mlflow.log_artifact(MODEL_SAVE_PATH)
        mlflow.end_run()
        print(f"\n[MLflow] Resultados disponibles en: {MLFLOW_URI}")
        print("         Ejecuta: mlflow ui --backend-store-uri services/ai-service/weights/mlruns")

    print("\n✅ ¡Entrenamiento completado!")
    print(f"   Accuracy final: {acc*100:.2f}%")
    print(f"   Clases: {list(le.classes_)}")


if __name__ == '__main__':
    main()
