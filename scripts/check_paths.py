# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
"""
check_paths.py - Verifica que todas las rutas del proyecto esten correctas
==========================================================================
Ejecuta este script ANTES de entrenar para confirmar que:
  1. La carpeta de imágenes existe
  2. El JSON se puede leer y las rutas se corrigen bien
  3. Los datos GBIF están disponibles
  4. Se puede crear la carpeta de caché

Uso:
    python scripts/check_paths.py
"""

import os
import sys
import json
import glob

BASE_DIR     = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_ROOT  = os.path.join(BASE_DIR, "Datos Crudos label")
JSON_PATH    = os.path.join(BASE_DIR, "data", "pre_annotated_dataset.json")
GBIF_ROOT    = os.path.join(BASE_DIR, "LOCALIZACION", "PAIS")
DATA_DIR     = os.path.join(BASE_DIR, "data")
MODELS_DIR   = os.path.join(BASE_DIR, "models")

OK    = "  [OK]  "
WARN  = "  [!]   "
ERROR = "  [ERR] "


def fix_path(raw_path: str) -> str:
    if not raw_path:
        return ""
    raw_path = raw_path.replace("\\", "/").replace("file:///", "")
    marker = "Datos Crudos label/"
    idx = raw_path.find(marker)
    if idx != -1:
        relative = raw_path[idx + len(marker):]
        # FIX: The JSON has 'Strabomantidae' but folder is 'Craugastoridae'
        relative = relative.replace("Strabomantidae", "Craugastoridae")
        return os.path.join(IMAGES_ROOT, relative.replace("/", os.sep))
    if os.path.exists(raw_path):
        return raw_path
    return ""


def main():
    errors = 0
    warnings = 0

    print("=" * 60)
    print("  Anura - Verificacion de Rutas y Datos")
    print("=" * 60)

    # 1. Carpeta raiz del proyecto
    print(f"\n[*] Base del proyecto: {BASE_DIR}")

    # 2. Carpeta de imágenes
    print(f"\n[1] Carpeta de imágenes: {IMAGES_ROOT}")
    if os.path.isdir(IMAGES_ROOT):
        # Contar imágenes
        img_count = 0
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            img_count += len(glob.glob(
                os.path.join(IMAGES_ROOT, "**", ext), recursive=True
            ))
        print(f"{OK} Encontrada con ~{img_count} imágenes.")
    else:
        print(f"{ERROR} Carpeta NO encontrada.")
        print(f"       Esperada en: {IMAGES_ROOT}")
        errors += 1

    # 3. JSON del dataset
    print(f"\n[2] JSON del dataset: {JSON_PATH}")
    if os.path.exists(JSON_PATH):
        with open(JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"{OK} JSON válido con {len(data)} entradas.")

        # Probar corrección de rutas
        found = 0
        not_found = 0
        sample_bad = []
        for item in data[:50]:  # revisar primeras 50
            raw1 = item.get("data", {}).get("original_path", "")
            raw2 = item.get("data", {}).get("image", "")
            fixed = fix_path(raw1) or fix_path(raw2)
            if fixed and os.path.exists(fixed):
                found += 1
            else:
                not_found += 1
                if len(sample_bad) < 3:
                    sample_bad.append(raw1 or raw2)

        if found > 0:
            print(f"{OK} {found}/{found+not_found} rutas corregidas OK (muestra de 50).")
        else:
            print(f"{ERROR} 0/{found+not_found} rutas corregidas. Las imágenes no se encuentran.")
            print(f"       ¿Está la carpeta en C:\\?")
            for b in sample_bad:
                print(f"       - Ruta original: {b}")
            errors += 1

        if not_found > 0 and found > 0:
            print(f"{WARN} {not_found}/{found+not_found} rutas no encontradas (muestra de 50).")
            warnings += 1

        # Especies detectadas
        species_set = set()
        for item in data:
            try:
                tax = item["annotations"][0]["result"][0]["value"]["taxonomy"]
                species_set.add(tax[0][-1])
            except Exception:
                pass
        print(f"{OK} Especies en el JSON: {sorted(species_set)}")

    else:
        print(f"{ERROR} JSON no encontrado.")
        errors += 1

    # 4. Datos GBIF
    print(f"\n[3] Datos GBIF: {GBIF_ROOT}")
    if os.path.isdir(GBIF_ROOT):
        gbif_files = glob.glob(os.path.join(GBIF_ROOT, "**", "*.json"), recursive=True)
        if gbif_files:
            print(f"{OK} {len(gbif_files)} archivo(s) GBIF encontrados.")
            for gf in gbif_files[:5]:
                rel = os.path.relpath(gf, GBIF_ROOT)
                print(f"       - {rel}")
        else:
            print(f"{WARN} No hay archivos JSON en GBIF_ROOT.")
            print(f"       Ejecuta: python LOCALIZACION/scripts/download_gbif_data.py")
            warnings += 1
    else:
        print(f"{WARN} Carpeta GBIF no encontrada: {GBIF_ROOT}")
        warnings += 1

    # 5. Carpetas de datos y modelos
    print(f"\n[4] Directorios de salida:")

    for d, name in [(DATA_DIR, "data/"), (MODELS_DIR, "models/")]:
        if os.path.isdir(d):
            print(f"{OK} {name} existe.")
        else:
            try:
                os.makedirs(d, exist_ok=True)
                print(f"{OK} {name} creado.")
            except Exception as e:
                print(f"{ERROR} No se puede crear {name}: {e}")
                errors += 1

    # 6. Resumen
    print("\n" + "=" * 60)
    if errors == 0 and warnings == 0:
        print("[OK] TODO CORRECTO - Puedes entrenar con:")
        print("   python scripts/train_finetune.py")
    elif errors == 0:
        print(f"[!] {warnings} advertencia(s) - El entrenamiento puede continuar.")
        print("   python scripts/train_finetune.py")
    else:
        print(f"[ERR] {errors} error(s) encontrado(s). Corrige antes de entrenar.")
    print("=" * 60)

    sys.exit(errors)


if __name__ == "__main__":
    main()
