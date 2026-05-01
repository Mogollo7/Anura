import os
import sys
import torch
from PIL import Image
import open_clip
import joblib

# ================= CONFIGURATION =================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_SAVE_PATH = os.path.join(BASE_DIR, "data", "custom_model.pkl")
os.environ["HF_HOME"] = os.path.join(BASE_DIR, "models")
# =================================================

def main(image_path):
    if not os.path.exists(image_path):
        print(f"Error: Image not found at {image_path}")
        return
        
    if not os.path.exists(MODEL_SAVE_PATH):
        print(f"Error: Trained model not found at {MODEL_SAVE_PATH}. Please run train_finetune.py first.")
        return

    print("Loading BioCLIP...")
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model, _, preprocess = open_clip.create_model_and_transforms('hf-hub:imageomics/bioclip-2.5-vith14')
    model.to(device)
    model.eval()
    
    print("Loading custom classifier...")
    custom_model = joblib.load(MODEL_SAVE_PATH)
    clf = custom_model["classifier"]
    le = custom_model["label_encoder"]
    
    print("Analyzing image...")
    image = Image.open(image_path).convert("RGB")
    image_input = preprocess(image).unsqueeze(0).to(device)
    
    with torch.no_grad(), torch.autocast(device_type=device.type):
        image_features = model.encode_image(image_input)
        image_features /= image_features.norm(dim=-1, keepdim=True)
        
    features = image_features.cpu().to(torch.float32).numpy().squeeze()
    
    # Predecir probablidades
    probs = clf.predict_proba([features])[0]
    
    print("\n==================================")
    print("        PREDICTION RESULTS          ")
    print("==================================")
    
    # Sort top results
    top_indices = probs.argsort()[::-1][:5]
    for idx in top_indices:
        class_name = le.inverse_transform([idx])[0]
        confidence = probs[idx] * 100
        print(f"{class_name.ljust(20)} : {confidence:.2f}%")
    print("==================================")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python predict_custom.py <path_to_image>")
        sys.exit(1)
    
    main(sys.argv[1])
