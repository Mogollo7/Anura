import joblib
import os

MODEL_SAVE_PATH = r"c:\user\OneDrive\Desktop\tareas\Anura\services\ai-service\weights\custom_model.pkl"

if os.path.exists(MODEL_SAVE_PATH):
    model_data = joblib.load(MODEL_SAVE_PATH)
    le = model_data["label_encoder"]
    print("Classes in model:")
    for cls in le.classes_:
        print(cls)
else:
    print(f"Model not found at {MODEL_SAVE_PATH}")
