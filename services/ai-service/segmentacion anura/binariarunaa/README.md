s## Estructura de Carpetas

- Coloca las imágenes que deseas procesar dentro de la carpeta `imagenes/testranasss/`.
- Las imágenes binarias generadas por IA se guardarán automáticamente en `imagenes/imagenes_binarias_ia/`.

## Uso

El proyecto consta de tres scripts principales:

1. **`detectar.py`**:
   Clasifica las imágenes utilizando el modelo pre-entrenado EfficientNetB0 para detectar qué objetos hay en ellas.
   ```bash
   python detectar.py
   ```

2. **`recortar_binarizar.py`**:
   Utiliza inteligencia artificial (`rembg`) para separar de forma precisa la rana del fondo, y genera una máscara binaria (silueta blanca sobre fondo negro).
   ```bash
   python recortar_binarizar.py
   ```

3. **`binarizar.py`**:
   Un método más simple y básico que convierte las imágenes a escala de grises y aplica un umbral (threshold) estático.
   ```bash
   python binarizar.py
   ```
