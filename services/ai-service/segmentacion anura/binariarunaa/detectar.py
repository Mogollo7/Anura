import os
import sys

try:
    import numpy as np
    from PIL import Image
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2' 
    import tensorflow as tf
    from tensorflow.keras.applications.efficientnet import EfficientNetB0, preprocess_input, decode_predictions
    from tensorflow.keras.preprocessing import image
except ImportError as e:
    print("❌ Error: Faltan librerías necesarias.")
    print(f"Detalle del error: {e}")
    sys.exit(1)

def clasificar_imagen(ruta_imagen):
    """
    Esta función toma la ruta de una imagen, la procesa y utiliza EfficientNetB0
    para predecir qué objeto hay en ella.
    """
    
    # 1. Comprobar si el archivo de imagen realmente existe
    if not os.path.exists(ruta_imagen):
        print(f"❌ Error: No se encontró ninguna imagen en la ruta: '{ruta_imagen}'")
        print("Asegúrate de que el nombre del archivo sea correcto y de que hayas colocado la imagen en la carpeta 'imagenes'.")
        return

    # 2. Comprobar si es un archivo con extensión de imagen válida (JPG, JPEG, PNG)
    extensiones_validas = ('.jpg', '.jpeg', '.png')
    if not ruta_imagen.lower().endswith(extensiones_validas):
        print(f"❌ Error: El archivo '{ruta_imagen}' no parece ser una imagen válida.")
        print("Por favor, usa una imagen con formato JPG o PNG.")
        return

    try:
        print("⏳ Cargando el modelo EfficientNetB0...")
        modelo = EfficientNetB0(weights='imagenet')

        print(f"⏳ Procesando la imagen: '{ruta_imagen}'...")
        img = image.load_img(ruta_imagen, target_size=(224, 224))
        img_array = image.img_to_array(img)
        img_batch = np.expand_dims(img_array, axis=0)
        img_preprocesada = preprocess_input(img_batch)

        print("🧠 Ejecutando predicción...")
        predicciones = modelo.predict(img_preprocesada)
        resultados = decode_predictions(predicciones, top=3)[0]

        print("\n✅ Resultados de la clasificación:")
        print("-" * 50)
        for i, (codigo_imagenet, nombre_clase, probabilidad) in enumerate(resultados):
            porcentaje = probabilidad * 100
            print(f"{i + 1}. {nombre_clase.capitalize()}: {porcentaje:.2f}% de confianza")
        print("-" * 50)

    except Exception as e:
        print("\n❌ Ocurrió un error inesperado al procesar la imagen.")
        print(f"Detalles del error técnico: {e}")

if __name__ == "__main__":
    nombre_del_objetivo = "testranasss" 
    
    directorio_script = os.path.dirname(os.path.abspath(__file__))
    carpeta_imagenes = os.path.join(directorio_script, "imagenes")
    ruta_completa = os.path.join(carpeta_imagenes, nombre_del_objetivo)
    
    if os.path.isdir(ruta_completa):
        print(f"\n[Carpeta] Se detectó una carpeta. Analizando imágenes en: '{ruta_completa}'\n")
        for archivo in os.listdir(ruta_completa):
            ruta_archivo = os.path.join(ruta_completa, archivo)
            if os.path.isfile(ruta_archivo):
                clasificar_imagen(ruta_archivo)
    else:
        clasificar_imagen(ruta_completa)
