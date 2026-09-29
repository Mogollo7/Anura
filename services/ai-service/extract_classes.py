import joblib
import os

SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_SAVE_PATH = os.path.join(SERVICE_DIR, "weights", "custom_model.pkl")

if os.path.exists(MODEL_SAVE_PATH):
    model_data = joblib.load(MODEL_SAVE_PATH)
    le = model_data["label_encoder"]
    print("Classes in model:")
    for cls in le.classes_:
        print(cls)
else:
    print(f"Model not found at {MODEL_SAVE_PATH}")
