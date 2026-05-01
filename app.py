import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from PIL import Image
import torch
import joblib

# Configure the cache directory to be the 'models' folder in your project
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.environ["HF_HOME"] = os.path.join(BASE_DIR, "models")

import open_clip

app = Flask(__name__)
CORS(app)

print("Loading BioCLIP model from local 'models' folder... This might take a few minutes if downloading.")
# Load Model
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model, preprocess_train, preprocess_val = open_clip.create_model_and_transforms('hf-hub:imageomics/bioclip-2.5-vith14')
model.to(device)
model.eval()

print("Loading custom trained classifier...")
CUSTOM_MODEL_PATH = os.path.join(BASE_DIR, "data", "custom_model.pkl")
try:
    custom_model = joblib.load(CUSTOM_MODEL_PATH)
    clf = custom_model["classifier"]
    le = custom_model["label_encoder"]
except Exception as e:
    print(f"Error loading custom model! Make sure you run train_finetune.py first: {e}")
print("Pre-warming model on GPU...")
with torch.no_grad():
    _dummy = torch.zeros(1, 3, 224, 224).to(device)
    model.encode_image(_dummy)
print("Model ready!")

@app.after_request
def no_cache(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    return response

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/predict', methods=['POST'])
def predict():
    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400
    try:
        if 'clf' not in globals():
            return jsonify({"error": "Custom model not loaded on server."}), 500
            
        file = request.files['image']
        image = Image.open(file.stream).convert("RGB")
        
        # Preprocess
        image_input = preprocess_val(image).unsqueeze(0).to(device)

        # Inference
        with torch.no_grad(), torch.autocast(device_type=device.type):
            image_features = model.encode_image(image_input)
            image_features /= image_features.norm(dim=-1, keepdim=True)
            
        features = image_features.cpu().to(torch.float32).numpy().squeeze()
        
        # Linear Head Prediction
        probs = clf.predict_proba([features])[0]
        
        # Format results (Top 5)
        top_indices = probs.argsort()[::-1][:5]
        results = [
            {"class": le.inverse_transform([idx])[0], "probability": float(probs[idx])} 
            for idx in top_indices
        ]
        
        return jsonify({"predictions": results})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
