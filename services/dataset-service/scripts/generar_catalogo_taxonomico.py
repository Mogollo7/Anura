"""Catálogo taxonómico que la Ficha usa para «Cargar datos del proyecto».

Toma COLOMBIA_ANURA/taxonomy/taxonomy_guide.json (iNaturalist + GBIF Backbone, verificado en el
proyecto) y deja en src/datos/catalogo_taxonomico.json, por taxon_id, solo lo que la ficha pública
pide y el proyecto ya tiene: autoría, sinónimos y nombre común. No inventa nada: lo vacío queda fuera.

Uso:  python services/dataset-service/scripts/generar_catalogo_taxonomico.py
"""
import json
import re
import sys
from pathlib import Path

ORIGEN = Path(r"D:\Anura\COLOMBIA_ANURA\taxonomy\taxonomy_guide.json")
DESTINO = Path(__file__).resolve().parent.parent / "src" / "datos" / "catalogo_taxonomico.json"

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

guia = json.loads(ORIGEN.read_text(encoding="utf-8"))
salida = {}
for taxon_id, r in sorted(guia.items()):
    autoria = (r.get("authorship") or "").strip()
    sinonimos = [s.strip() for s in re.split(r"[;|]", r.get("synonyms") or "") if s.strip()]
    nombre = (r.get("common_name_es") or "").strip()
    item = {}
    if autoria:
        item["autoria"] = autoria
    if sinonimos:
        item["sinonimos"] = sinonimos
    if nombre:
        item["nombre"] = nombre
    if item:
        item["fuente"] = f"{(r.get('source') or 'iNaturalist; GBIF Backbone').strip()}, verificado {r.get('last_verified') or 's. f.'}"
        salida[taxon_id] = item

DESTINO.parent.mkdir(parents=True, exist_ok=True)
DESTINO.write_text(json.dumps(salida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(salida)} especies con datos -> {DESTINO}")
