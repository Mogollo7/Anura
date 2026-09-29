/**
 * Entrega de paquetes regionales (C1) a partir de archivos que ya existen:
 * el sqlite de identificación de un departamento y el catálogo JSON de cada subregión.
 * El índice (paquetes/indice.json) describe país → departamento → subregión.
 * El tamaño y el sha256 se calculan del archivo, no se escriben a mano.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.PACKAGES_DIR || path.join(__dirname, '..', 'paquetes');

let cache = null;
const archivos = new Map();

function huella(abs) {
  const buf = fs.readFileSync(abs);
  return {
    size_bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

function adorn(node) {
  const hijos = (node.hijos || []).map(adorn);
  let propio = null;
  if (node.archivo) {
    const abs = path.join(DIR, node.archivo);
    if (!fs.existsSync(abs)) {
      throw new Error(`Falta el artefacto de paquetes: ${node.archivo}`);
    }
    const hash = huella(abs);
    archivos.set(node.id, { abs, formato: node.formato, sha256: hash.sha256 });
    propio = {
      ...hash,
      archivo_url: `/api/dataset/publico/paquetes/${encodeURIComponent(node.id)}/archivo`,
    };
  }
  const sizeHijos = hijos.reduce((sum, hijo) => sum + hijo.size_bytes, 0);
  return {
    id: node.id,
    nivel: node.nivel,
    nombre: node.nombre,
    version: node.version || null,
    especies: node.especies ?? null,
    formato: node.formato || null,
    nota: node.nota || null,
    sha256: propio?.sha256 || null,
    size_archivo: propio?.size_bytes || 0,
    size_bytes: (propio?.size_bytes || 0) + sizeHijos,
    archivo_url: propio?.archivo_url || null,
    hijos,
  };
}

function arbol() {
  if (cache) return cache;
  const indice = JSON.parse(fs.readFileSync(path.join(DIR, 'indice.json'), 'utf8'));
  archivos.clear();
  cache = {
    generado: new Date().toISOString(),
    paises: (indice.paises || []).map(adorn),
  };
  return cache;
}

function archivo(id) {
  arbol();
  return archivos.get(id) || null;
}

module.exports = { arbol, archivo };
