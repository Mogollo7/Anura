# Sapito 🐸

Aplicación de AI para la identificación de anuros usando BioCLIP y clasificadores personalizados.

## Estructura del Proyecto

- `app.py`: Servidor Flask para la interfaz web.
- `data/`: Contiene el modelo entrenado (`custom_model.pkl`), la caché de características y el dataset de etiquetas.
- `scripts/`: Scripts de utilidad para entrenamiento, generación de JSON y predicciones locales.
- `models/`: Directorio local para el almacenamiento de pesos del modelo BioCLIP (HF_HOME).
- `LOCALIZACION/`: Carpeta destinada a guardar información geográfica de los avistamientos.
- `static/` & `templates/`: Archivos del frontend (HTML, CSS, JS).
- `requirements.txt`: Dependencias del proyecto.
