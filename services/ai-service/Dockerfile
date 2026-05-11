FROM pytorch/pytorch:2.2.1-cuda12.1-cudnn8-runtime

WORKDIR /app

COPY requirements.txt .
# Install packages (torch/torchvision already in base image)
RUN pip install --no-cache-dir \
    "fastapi>=0.111.0" \
    "uvicorn[standard]>=0.29.0" \
    "python-multipart>=0.0.9" \
    "timm==0.9.16" \
    "open-clip-torch==2.24.0" \
    "scikit-learn==1.3.2" \
    "albumentations>=1.3.0" \
    "opencv-python-headless>=4.8.0" \
    "Pillow>=10.0.0" \
    "numpy<2.0.0" \
    "joblib>=1.3.0" \
    "mlflow>=2.10.0" \
    "requests>=2.31.0" \
    "matplotlib>=3.8.0" \
    "polars>=0.19.0"

COPY app/ ./app/

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
