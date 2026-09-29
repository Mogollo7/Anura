"""
Worker de embeddings (M2) dentro de model-service.

No recibe conexiones: PIDE trabajo a dataset-service por HTTP (X-Worker-Token), baja cada foto
por ahí mismo y devuelve los vectores. Así funciona igual en este PC que con el servidor en
Hostinger detrás de un túnel.

El encoder es el mismo ONNX del teléfono (encoder_anura_fp16.onnx, sha256 219e860e…) y el
preprocesado es el de open_clip (lado corto a 224 con bicúbico de Pillow, recorte central,
media/desviación de CLIP), igual que ClipPreprocessor.kt en Android. Verificado 2026-09-27:
diferencia 0,0 contra open_clip.image_transform y coseno ≥ 0,9999999 en los vectores.
Ver EMBEDDING_CONTRACT.md y 19_ADMIN/Plan del Backend Real (M2).
"""
from __future__ import annotations

import base64
import hashlib
import io
import os
import threading
import time
import traceback

import numpy as np
import onnxruntime as ort
import requests
from PIL import Image

CONTRATO = {
    "encoder_id": "bioclip_anura_v1",
    "encoder_family": "BioCLIP",
    "encoder_variant": "ViT-B-16",
    "encoder_source": "hf-hub:imageomics/bioclip",
    "checkpoint_file": "bioclip_anura_mejor.pt",
    "onnx_export": "encoder_anura_fp16.onnx",
    "encoder_sha256": "219e860e6fa9a80fb30a59fc8f61911421bbd53a4537dca831803d3ab446b2ad",
    "embedding_dimension": 512,
    "preprocessing_version": "open_clip.create_model_and_transforms native preprocess",
    "normalization_version": "L2 (embedding / ||embedding||)",
}

MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)
SIZE = 224
LOTE = 32
ESPERA_SIN_TRABAJO_S = 15


def preprocesar(datos: bytes) -> np.ndarray:
    """[1,3,224,224] float32, idéntico a open_clip.image_transform(224, is_train=False)."""
    img = Image.open(io.BytesIO(datos)).convert("RGB")
    w, h = img.size
    nw, nh = (SIZE, int(SIZE * h / w)) if w <= h else (int(SIZE * w / h), SIZE)
    img = img.resize((nw, nh), Image.BICUBIC)
    top, left = int(round((nh - SIZE) / 2.0)), int(round((nw - SIZE) / 2.0))
    a = np.asarray(img.crop((left, top, left + SIZE, top + SIZE)), np.float32) / 255.0
    return ((a - MEAN) / STD).transpose(2, 0, 1)[None]


def sha256_de(ruta: str) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


class Worker:
    def __init__(self) -> None:
        self.url = os.environ["DATASET_SERVICE_URL"].rstrip("/")
        self.nombre = os.environ.get("WORKER_NOMBRE", "model-service")
        self.http = requests.Session()
        self.http.headers.update({"X-Worker-Token": os.environ["WORKER_TOKEN"], "X-Worker-Name": self.nombre})
        ruta = os.environ.get("ENCODER_PATH", "/app/models/encoder/encoder_anura_fp16.onnx")
        sha = sha256_de(ruta)
        if sha != CONTRATO["encoder_sha256"]:
            # Otro archivo = otro encoder: sus vectores no serían comparables con los del teléfono.
            raise RuntimeError(f"{ruta} tiene sha256 {sha}, no el del contrato ({CONTRATO['encoder_sha256']})")
        disponibles = ort.get_available_providers()
        proveedores = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in disponibles]
        self.sesion = ort.InferenceSession(ruta, providers=proveedores)
        self.info = {"onnxruntime": ort.__version__, "proveedor": self.sesion.get_providers()[0], "ms_por_foto": None}
        self.estado = "iniciando"

    def _post(self, ruta: str, cuerpo: dict | None = None) -> dict:
        r = self.http.post(f"{self.url}{ruta}", json=cuerpo or {}, timeout=60)
        r.raise_for_status()
        return r.json()

    def _get(self, ruta: str, **kw):
        r = self.http.get(f"{self.url}{ruta}", timeout=60, **kw)
        r.raise_for_status()
        return r

    def registrar(self) -> None:
        self._post("/api/worker/encoder", {"contrato": CONTRATO, "info": self.info})

    def vector(self, datos: bytes) -> np.ndarray:
        emb = self.sesion.run(["embedding"], {"imagen": preprocesar(datos)})[0][0].astype(np.float32)
        return emb / np.linalg.norm(emb)

    def correr_trabajo(self, trabajo: dict) -> None:
        tid = trabajo["id"]
        print(f"[worker] trabajo #{tid} ({trabajo['tipo']})", flush=True)
        while True:
            lote = self._get(f"/api/worker/trabajos/{tid}/lote", params={"limit": LOTE}).json()
            if lote["estado"] != "en_curso":
                print(f"[worker] trabajo #{tid} quedó {lote['estado']}; se suelta", flush=True)
                return
            if not lote["fotos"]:
                self._post(f"/api/worker/trabajos/{tid}/fin", {"estado": "hecho", "mensaje": "Todas las fotos tienen vector"})
                print(f"[worker] trabajo #{tid} hecho", flush=True)
                return
            vectores, errores = [], []
            t0 = time.time()
            for sha in lote["fotos"]:
                try:
                    v = self.vector(self._get(f"/api/worker/fotos/{sha}").content)
                    vectores.append({"sha256": sha, "v": base64.b64encode(v.astype("<f4").tobytes()).decode()})
                except requests.RequestException:
                    raise  # red: se reintenta el lote completo
                except Exception as e:  # foto dañada: se anota y se sigue
                    errores.append({"sha256": sha, "error": f"{type(e).__name__}: {e}"})
            ms = (time.time() - t0) * 1000 / max(len(lote["fotos"]), 1)
            self.info["ms_por_foto"] = round(ms)
            r = self._post(f"/api/worker/trabajos/{tid}/vectores", {
                "vectores": vectores, "errores": errores,
                "mensaje": f"{self.info['proveedor'].replace('ExecutionProvider', '')} · {ms:.0f} ms por foto",
            })
            if r.get("estado") != "en_curso":
                print(f"[worker] trabajo #{tid} {r.get('estado')} desde el Admin; se detiene", flush=True)
                return

    def bucle(self) -> None:
        registrado = False
        while True:
            try:
                if not registrado:
                    self.registrar()
                    registrado = True
                    print(f"[worker] {self.nombre} registrado en {self.url} ({self.info['proveedor']})", flush=True)
                trabajo = self._post("/api/worker/trabajos/tomar").get("trabajo")
                if trabajo:
                    self.estado = f"trabajo #{trabajo['id']}"
                    self.correr_trabajo(trabajo)
                    self.registrar()  # actualiza ms_por_foto
                    continue
                self.estado = "esperando trabajo"
            except requests.RequestException as e:
                self.estado = f"sin conexión con dataset-service ({type(e).__name__})"
                registrado = False
                print(f"[worker] {self.estado}; reintento en {ESPERA_SIN_TRABAJO_S} s", flush=True)
            except Exception:
                self.estado = "error; ver logs"
                traceback.print_exc()
            time.sleep(ESPERA_SIN_TRABAJO_S)


_worker: Worker | None = None


def iniciar() -> str:
    """Arranca el worker en un hilo aparte (onnxruntime suelta el GIL: /api/predict sigue atendiendo)."""
    global _worker
    if not os.environ.get("WORKER_TOKEN") or not os.environ.get("DATASET_SERVICE_URL"):
        return "apagado (falta WORKER_TOKEN o DATASET_SERVICE_URL)"
    try:
        _worker = Worker()
    except Exception as e:
        print(f"[worker] no arranca: {e}", flush=True)
        return f"no arranca: {e}"
    threading.Thread(target=_worker.bucle, name="worker-embeddings", daemon=True).start()
    return "encendido"


def estado() -> dict:
    if _worker is None:
        return {"estado": "apagado"}
    return {"estado": _worker.estado, "nombre": _worker.nombre, **_worker.info}
