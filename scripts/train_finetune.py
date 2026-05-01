import os
import json
import torch
import numpy as np
import joblib
import cv2
from PIL import Image
import open_clip
import albumentations as A
from albumentations.pytorch import ToTensorV2
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from collections import defaultdict

# ===================== CONFIGURATION =====================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH        = os.path.join(BASE_DIR, "data", "pre_annotated_dataset.json")
MODEL_SAVE_PATH  = os.path.join(BASE_DIR, "data", "custom_model.pkl")
CACHE_PATH       = os.path.join(BASE_DIR, "data", "features_cache.pkl")
OS_MODELS_PATH   = os.path.join(BASE_DIR, "models")
os.environ["HF_HOME"] = OS_MODELS_PATH

TRAIN_SPLIT      = 0.75   # 75% train / 25% val-test
AUG_REPEATS      = 3      # number of augmented copies per training image
SAVE_EVERY       = 25     # auto-save cache every N images
# =========================================================

# ---------- Albumentations augmentation pipeline ----------
AUGMENT = A.Compose([
    A.HorizontalFlip(p=0.5),
    A.VerticalFlip(p=0.3),
    A.RandomRotate90(p=0.5),
    A.ShiftScaleRotate(shift_limit=0.2, scale_limit=0.2, rotate_limit=30, p=0.5),
    A.ElasticTransform(alpha=120, sigma=6, p=0.3),
    A.GridDistortion(p=0.2),
    A.Perspective(p=0.3),
])

def augment_pil(pil_image: Image.Image, n: int = 1):
    """Return n augmented versions of a PIL image as PIL images."""
    img_np = np.array(pil_image)
    results = []
    for _ in range(n):
        augmented = AUGMENT(image=img_np)["image"]
        results.append(Image.fromarray(augmented))
    return results

# ---------- Dataset loader ----------
def load_dataset(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    image_paths, labels = [], []
    for item in data:
        full_path = item.get("data", {}).get("original_path", "")
        if not full_path or not os.path.exists(full_path):
            raw = item.get("data", {}).get("image", "")
            if raw.startswith("file:///"):
                full_path = raw.replace("file:///", "")
            else:
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

        final_label = taxonomy[0][-1]
        image_paths.append(full_path)
        labels.append(final_label)

    return image_paths, labels

# ---------- Embedding extractor ----------
def extract_embeddings(image_list, model, preprocess, device, desc=""):
    """Extract and return L2-normalised embeddings for a list of PIL images."""
    embeddings = []
    with torch.no_grad():
        for img in image_list:
            inp = preprocess(img).unsqueeze(0).to(device)
            with torch.autocast(device_type=device.type):
                feats = model.encode_image(inp)
                feats = feats / feats.norm(dim=-1, keepdim=True)
            embeddings.append(feats.cpu().to(torch.float32).numpy().squeeze())
    return embeddings

# ---------- Main ----------
def main():
    print("1. Parsing JSON Dataset...")
    image_paths, labels = load_dataset(JSON_PATH)

    valid_paths, valid_labels = [], []
    for p, l in zip(image_paths, labels):
        if os.path.exists(p):
            valid_paths.append(p)
            valid_labels.append(l)
        else:
            print(f"  [Warning] Not found: {p}")

    if not valid_paths:
        print("ERROR: No valid images found.")
        return

    print(f"Found {len(valid_paths)} valid images across {len(set(valid_labels))} species.")

    # ---- 75/25 stratified split ----
    idx = list(range(len(valid_paths)))
    train_idx, val_idx = train_test_split(
        idx, test_size=(1 - TRAIN_SPLIT), stratify=valid_labels, random_state=42
    )
    train_paths  = [valid_paths[i] for i in train_idx]
    train_labels = [valid_labels[i] for i in train_idx]
    val_paths    = [valid_paths[i] for i in val_idx]
    val_labels   = [valid_labels[i] for i in val_idx]

    print(f"Split -> Train: {len(train_paths)} | Val: {len(val_paths)}")

    # ---- Load BioCLIP ----
    print("\n2. Loading BioCLIP (ViT-H/14)...")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"   Device: {device}")
    model, _, preprocess = open_clip.create_model_and_transforms(
        'hf-hub:imageomics/bioclip-2.5-vith14'
    )
    model.to(device).eval()

    # ---- Load / resume cache ----
    cache = {"processed": {}, "val_embs": [], "val_labels": []}
    if os.path.exists(CACHE_PATH):
        try:
            cache = joblib.load(CACHE_PATH)
            print(f"   Resumed cache with {len(cache['processed'])} train images.")
        except Exception as e:
            print(f"   Could not load cache ({e}), starting fresh.")

    # ---- Extract train embeddings (with augmentation) ----
    print(f"\n3. Extracting Train Embeddings + {AUG_REPEATS}x Augmentation...")
    train_embs_all, train_labels_all = [], []

    for i, (path, label) in enumerate(zip(train_paths, train_labels)):
        if path in cache["processed"]:
            # Recover from cache
            train_embs_all.extend(cache["processed"][path]["embs"])
            train_labels_all.extend(cache["processed"][path]["lbls"])
            continue

        print(f"  [{i+1}/{len(train_paths)}] {os.path.basename(path)}")
        try:
            pil = Image.open(path).convert("RGB")
            # Original + augmented copies
            all_versions = [pil] + augment_pil(pil, AUG_REPEATS)
            embs = extract_embeddings(all_versions, model, preprocess, device)

            lbls = [label] * len(embs)
            train_embs_all.extend(embs)
            train_labels_all.extend(lbls)

            cache["processed"][path] = {"embs": embs, "lbls": lbls}

            if (i + 1) % SAVE_EVERY == 0:
                joblib.dump(cache, CACHE_PATH)
                print(f"    [Autosave] {i+1}/{len(train_paths)} done")

        except Exception as e:
            print(f"  [Error] {path}: {e}")

    joblib.dump(cache, CACHE_PATH)

    # ---- Extract val embeddings (no augmentation) ----
    if not cache.get("val_embs"):
        print(f"\n4. Extracting Validation Embeddings (no augmentation)...")
        val_pils = [Image.open(p).convert("RGB") for p in val_paths]
        val_embs = extract_embeddings(val_pils, model, preprocess, device, "val")
        cache["val_embs"] = val_embs
        cache["val_labels"] = val_labels
        joblib.dump(cache, CACHE_PATH)
    else:
        val_embs   = cache["val_embs"]
        val_labels = cache["val_labels"]
        print(f"\n4. Validation embeddings loaded from cache.")

    X_train = np.array(train_embs_all)
    y_train_raw = train_labels_all
    X_val   = np.array(val_embs)
    y_val_raw   = val_labels

    # ---- Fit classifier ----
    print("\n5. Training Linear Classifier...")
    le = LabelEncoder()
    le.fit(y_train_raw + y_val_raw)
    y_train = le.transform(y_train_raw)
    y_val   = le.transform(y_val_raw)

    clf = LogisticRegression(max_iter=2000, C=4.0, solver='lbfgs')
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_val)
    acc = accuracy_score(y_val, y_pred)

    print(f"\n{'='*50}")
    print(f"  Validation Accuracy: {acc*100:.2f}%")
    print(f"{'='*50}")
    print(classification_report(y_val, y_pred, target_names=le.classes_))

    # ---- Save ----
    print("\n6. Saving Model...")
    joblib.dump({"classifier": clf, "label_encoder": le}, MODEL_SAVE_PATH)
    print(f"   Saved -> {MODEL_SAVE_PATH}")
    print("Done!")

if __name__ == '__main__':
    main()
