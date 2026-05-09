# Anura AI Service
## FastAPI + BioCLIP frog classifier

### Requisitos
- Python 3.11+
- CUDA opcional (corre en CPU también)

### Setup local

```bash
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Asegúrate de tener el modelo entrenado en weights/
python training/train_finetune.py   # si no existe aún

uvicorn app.main:app --reload --port 8000
```

### Endpoints

| Method | Path            | Descripción                        |
|--------|-----------------|------------------------------------|
| GET    | `/health`       | Estado del servicio y modelo       |
| POST   | `/api/predict`  | Clasificar imagen de rana          |

### POST /api/predict

**Form-data:**
- `image` (file) — imagen JPG/PNG de la rana
- `lat` (float, opcional) — latitud GPS
- `lon` (float, opcional) — longitud GPS

**Respuesta:**
```json
{
  "predictions": [
    { "class": "Pristimantis_bogotensis", "probability": 0.82, "is_frog": true, "location_score": 0.91 }
  ],
  "best_class": "Pristimantis_bogotensis",
  "best_prob": 0.82,
  "is_frog": true,
  "location_used": true
}
```

### Docker

```bash
docker build -t anura-ai .
docker run -p 8000:8000 -v ./weights:/app/weights anura-ai
```
