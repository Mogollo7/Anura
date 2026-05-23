import os
import numpy as np
from PIL import Image

def convertir_carpeta_a_binaria(carpeta_entrada, carpeta_salida, umbral=128):
    """
    Toma todas las imágenes de una carpeta y las convierte a blanco y negro puro (imágenes binarias).
    """
    # Crear la carpeta de salida si no existe
    if not os.path.exists(carpeta_salida):
        os.makedirs(carpeta_salida)
        
    # Listar los archivos en la carpeta de entrada
    for archivo in os.listdir(carpeta_entrada):
        ruta_archivo = os.path.join(carpeta_entrada, archivo)
        
        # Ignorar si es otra subcarpeta
        if not os.path.isfile(ruta_archivo):
            continue
            
            img = Image.open(ruta_archivo).convert('L')
            img_array = np.array(img)
            img_binaria_array = (img_array > umbral) * 255
            img_binaria = Image.fromarray(np.uint8(img_binaria_array))
            
            ruta_guardado = os.path.join(carpeta_salida, f"binaria_{archivo}")
            img_binaria.save(ruta_guardado)
            print(f"[EXITO] Convertida: {archivo} -> Guardada como binaria_{archivo}")
            
        except Exception as e:
            print(f"[ERROR] No se pudo procesar '{archivo}': {e}")

if __name__ == "__main__":
    directorio_script = os.path.dirname(os.path.abspath(__file__))
    carpeta_origen = os.path.join(directorio_script, "imagenes", "testranasss")
    carpeta_destino = os.path.join(directorio_script, "imagenes", "imagenes_binarias")
    
    if os.path.exists(carpeta_origen):
        print(f"[Aviso] Iniciando conversión a blanco y negro (binaria)...")
        convertir_carpeta_a_binaria(carpeta_origen, carpeta_destino, umbral=128)
        print(f"\n[Terminado] ¡Listo! Revisa la nueva carpeta creada: {carpeta_destino}")
    else:
        print(f"[Error] No se encontró la carpeta origen: {carpeta_origen}")
