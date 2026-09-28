import { REAL } from "@/lib/data/real";

/**
 * Único lugar donde viven las cifras del encoder. Las del teléfono son
 * MEDIDAS (DECISION_LOG, EXP-008/009, 2026-09-12). Las del PC del worker no
 * existen en el vault todavía: se muestran como estimación, nunca como medición.
 */
export const ENCODER = {
  /** Identidad del espacio vectorial: el archivo que viaja en el teléfono. El compilador rechaza cualquier otro. */
  id: "encoder_anura_fp16",
  nombre: "BioCLIP 1 (ViT-B/16) con fine-tuning en ranas (bioclip_anura_mejor.pt); no se reentrena desde el 2026-09-12",
  archivo: "encoder_anura_fp16.onnx",
  sha256: REAL.encoders.telefono.sha256,
  dimensiones: 512,
  precision: "FP16",
  onnxMb: 165.6,
  picoRamMb: 405,
  latencia1HiloMs: 403,
  latencia4HilosMs: 154,
  fuente: "DECISION_LOG · EXP-008/009 (2026-09-12)",
} as const;

/**
 * El modelo del servidor: BioCLIP 2.5 ViT-H/14, instalado en services/ai-service
 * (identificación web y auditoría de rechazos). Vive en otro espacio (1024) y
 * nunca entra a un paquete: por eso el worker tiene una prueba que mete uno a
 * propósito y comprueba que la validación lo manda a cuarentena.
 */
export const AUDIT_ENCODER = {
  id: "bioclip-2.5-vith14",
  nombre: "BioCLIP 2.5 (ViT-H/14) del servidor",
  dimensiones: REAL.encoders.servidor.dimensiones,
} as const;

export const WORKER_GPU = {
  nombre: "NVIDIA GeForce RTX 4050 Laptop",
  vramMb: 6144,
  /** Sin benchmark en el vault: estimación para ViT-B/16 FP16 con decodificación JPEG en CPU. */
  imgsPorSegundoEstimado: 150,
  pesoModeloVramMb: 330,
} as const;
