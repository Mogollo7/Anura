/**
 * Modelo de rechazo Open Set del paquete, en el formato binario `ANOS` v1 que ya lee el teléfono
 * (OpenSetModel.kt; mismo layout que tools/mobile/export_mobile_inference.py). Todo little-endian:
 *
 *   offset  tamaño        contenido
 *   0       4             "ANOS" (ASCII)
 *   4       4             int32   versión = 1
 *   8       4             int32   dim
 *   12      4             int32   k (número de especies)
 *   16      8             float64 τ (el umbral VALIDADO por una persona)
 *   24      dim·dim·8     float64 precisión compartida (inversa de la covarianza Ledoit-Wolf), fila mayor
 *   …       k·dim·8       float64 medias crudas de train de cada especie (k filas de dim)
 *   …       k × (4 + n)   ids: int32 n + n bytes UTF-8 (el taxon_id del paquete), en el orden de las medias
 *
 * El teléfono acepta una foto si √min_k (x−μ_k)ᵀ·P·(x−μ_k) ≤ τ. Las medias y la precisión salen tal
 * cual de `dataset.osr_calibracion` (osr.js): float64 little-endian, sin conversión.
 */
const crypto = require('crypto');

const MAGIC = 'ANOS';
const VERSION = 1;
const FORMATO = 'ANOS v1';
const CABECERA = 24;

/** Todos los float64 little-endian del buffer son finitos (un NaN o Infinity rompería el rechazo). */
function finitos(buf) {
  for (let i = 0; i + 8 <= buf.length; i += 8) if (!Number.isFinite(buf.readDoubleLE(i))) return false;
  return true;
}

/**
 * @param dim        dimensión del encoder (512)
 * @param tau        umbral validado
 * @param precision  Buffer float64 LE, dim·dim
 * @param medias     Buffer float64 LE, ids.length·dim
 * @param ids        taxon_id del paquete, uno por fila de `medias`
 * @returns { data: Buffer, sha256, size_bytes, dim, k, tau, formato }
 */
function codificar({ dim, tau, precision, medias, ids }) {
  if (!Number.isInteger(dim) || dim <= 0) throw new Error('El modelo OSR necesita la dimensión del encoder');
  if (!Number.isFinite(tau) || tau <= 0) throw new Error('El modelo OSR necesita un umbral mayor que 0');
  if (!ids.length) throw new Error('El modelo OSR necesita al menos una especie');
  if (precision.length !== dim * dim * 8) throw new Error(`La precisión del OSR mide ${precision.length} bytes y debería medir ${dim * dim * 8}`);
  if (medias.length !== ids.length * dim * 8) throw new Error(`Las medias del OSR miden ${medias.length} bytes y deberían medir ${ids.length * dim * 8}`);
  if (new Set(ids).size !== ids.length) throw new Error('El modelo OSR tiene un taxon_id repetido');
  if (!finitos(precision) || !finitos(medias)) throw new Error('La calibración OSR tiene valores que no son números');

  const cabecera = Buffer.alloc(CABECERA);
  cabecera.write(MAGIC, 0, 'ascii');
  cabecera.writeInt32LE(VERSION, 4);
  cabecera.writeInt32LE(dim, 8);
  cabecera.writeInt32LE(ids.length, 12);
  cabecera.writeDoubleLE(tau, 16);
  const textos = ids.map((id) => {
    const bytes = Buffer.from(id, 'utf8');
    const largo = Buffer.alloc(4);
    largo.writeInt32LE(bytes.length, 0);
    return Buffer.concat([largo, bytes]);
  });
  const data = Buffer.concat([cabecera, precision, medias, ...textos]);
  return {
    data,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
    size_bytes: data.length,
    dim,
    k: ids.length,
    tau,
    formato: FORMATO,
  };
}

/** Lee un ANOS (lo que hace OpenSetModel.read en el teléfono). Falla con el motivo si el archivo no es válido. */
function decodificar(buf) {
  if (buf.length < CABECERA) throw new Error('Archivo Open Set truncado');
  const magic = buf.toString('ascii', 0, 4);
  if (magic !== MAGIC) throw new Error(`Archivo Open Set inválido: magic=${magic}`);
  const version = buf.readInt32LE(4);
  if (version !== VERSION) throw new Error(`Versión de Open Set no soportada: ${version}`);
  const dim = buf.readInt32LE(8);
  const k = buf.readInt32LE(12);
  const tau = buf.readDoubleLE(16);
  if (dim <= 0 || k <= 0) throw new Error('Open Set sin dimensión o sin especies');
  const finPrecision = CABECERA + dim * dim * 8;
  const finMedias = finPrecision + k * dim * 8;
  if (buf.length < finMedias) throw new Error('Archivo Open Set truncado');
  const doubles = (desde, n) => Float64Array.from({ length: n }, (_, i) => buf.readDoubleLE(desde + i * 8));
  const ids = [];
  let pos = finMedias;
  for (let i = 0; i < k; i++) {
    const n = buf.readInt32LE(pos);
    pos += 4;
    ids.push(buf.toString('utf8', pos, pos + n));
    pos += n;
  }
  if (pos !== buf.length) throw new Error('Archivo Open Set con bytes de más');
  return { version, dim, k, tau, precision: doubles(CABECERA, dim * dim), centroides: doubles(finPrecision, k * dim), ids };
}

module.exports = { codificar, decodificar, FORMATO, VERSION, MAGIC };
