import os
import numpy as np
from PIL import Image
from rembg import remove

def procesar_imagenes_ia(carpeta_entrada, carpeta_salida):
    """
    Toma imágenes, les quita el fondo con IA (rembg) y crea una máscara binaria.
    """
    if not os.path.exists(carpeta_salida):
        os.makedirs(carpeta_salida)
        
    for archivo in os.listdir(carpeta_entrada):
        ruta_archivo = os.path.join(carpeta_entrada, archivo)
        
        if not os.path.isfile(ruta_archivo):
            continue
            
        try:
            print(f"[PROCESANDO] {archivo}...")
            
            img_original = Image.open(ruta_archivo)
            img_sin_fondo = remove(img_original)
            
            img_array = np.array(img_sin_fondo)
            canal_alpha = img_array[:, :, 3]
            
            img_binaria_array = (canal_alpha > 50) * 255
            img_binaria = Image.fromarray(np.uint8(img_binaria_array), 'L')
            
            # 6. Guardar la imagen en la nueva carpeta
            ruta_guardado = os.path.join(carpeta_salida, f"binaria_ia_{archivo}")
            img_binaria.save(ruta_guardado)
            
            print(f"[ÉXITO] Guardada como {ruta_guardado}")
            
        except Exception as e:
            print(f"[ERROR] No se pudo procesar '{archivo}': {e}")

if __name__ == "__main__":
    directorio_script = os.path.dirname(os.path.abspath(__file__))
    
    # Carpetas de origen y destino
    carpeta_origen = os.path.join(directorio_script, "imagenes", "testranasss")
    carpeta_destino = os.path.join(directorio_script, "imagenes", "imagenes_binarias_ia")
    
    if os.path.exists(carpeta_origen):
        print(f"Iniciando extracción de fondo con IA y binarización...")
        print(f"Buscando en: {carpeta_origen}")
        print("Nota: La primera vez que se ejecuta, la IA descargará su modelo (~170MB). Por favor espera.")
        
        procesar_imagenes_ia(carpeta_origen, carpeta_destino)
        
        print(f"\n[TERMINADO] ¡Listo! Revisa la nueva carpeta: {carpeta_destino}")
    else:
        print(f"[Error] No se encontró la carpeta origen: {carpeta_origen}")
