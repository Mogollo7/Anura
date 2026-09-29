/**
 * Entrega pública de paquetes (C1): lo que la app y la web pueden descargar. Solo lo PUBLICADO
 * en Admin → Release (packages.regional_packages con estado 'publicado', dos aprobaciones).
 * Árbol país → departamento → subregión; cada subregión trae su sqlite de identificación y su
 * manifiesto JSON. Sin paquetes publicados el árbol está vacío: la app lo dice, no inventa uno.
 * El tamaño y el sha256 son los que se calcularon al compilar el archivo.
 */
const NOTA_SUBREGION = 'Paquete de identificación de la subregión (SQLite).';

const PUBLICADOS = `
  SELECT p.id, p.region_id, p.version, p.sha256, p.size_bytes, p.especies, p.published_at,
         p.storage_key, p.manifiesto_key, s.nombre, s.numero, r.codigo_dane, r.nombre AS region_nombre
  FROM packages.regional_packages p
  JOIN dataset.subregion s ON s.id = p.subregion_id
  JOIN dataset.region r ON r.codigo_dane = s.region
  WHERE p.estado = 'publicado'`;

const url = (id, que) => `/api/dataset/publico/paquetes/${encodeURIComponent(id)}/${que}`;

async function arbol(db) {
  const { rows } = await db.query(`${PUBLICADOS} ORDER BY r.nombre, s.numero`);
  const departamentos = new Map();
  for (const r of rows) {
    if (!departamentos.has(r.codigo_dane)) {
      departamentos.set(r.codigo_dane, {
        id: r.codigo_dane,
        nivel: 'departamento',
        nombre: r.region_nombre,
        version: null,
        especies: null,
        formato: null,
        nota: 'Bajar el departamento baja los paquetes de todas sus subregiones.',
        sha256: null,
        size_archivo: 0,
        size_bytes: 0,
        archivo_url: null,
        hijos: [],
      });
    }
    const dep = departamentos.get(r.codigo_dane);
    const size = Number(r.size_bytes);
    dep.hijos.push({
      id: r.region_id,
      nivel: 'subregion',
      nombre: r.nombre,
      version: String(r.version),
      especies: r.especies,
      formato: 'sqlite',
      nota: NOTA_SUBREGION,
      sha256: r.sha256,
      size_archivo: size,
      size_bytes: size,
      archivo_url: url(r.region_id, 'archivo'),
      manifiesto_url: url(r.region_id, 'manifiesto'),
      publicado: r.published_at,
      hijos: [],
    });
    dep.size_bytes += size;
  }
  const hijos = [...departamentos.values()];
  return {
    generado: new Date().toISOString(),
    paises: hijos.length
      ? [{
        id: 'colombia',
        nivel: 'pais',
        nombre: 'Colombia',
        version: null,
        especies: null,
        formato: null,
        nota: 'Bajar el país baja los paquetes de sus departamentos.',
        sha256: null,
        size_archivo: 0,
        size_bytes: hijos.reduce((s, d) => s + d.size_bytes, 0),
        archivo_url: null,
        hijos,
      }]
      : [],
  };
}

/** El paquete publicado de una subregión (id "<DANE>.<CLAVE>"), o null. */
async function publicado(db, id) {
  const { rows: [r] } = await db.query(`${PUBLICADOS} AND p.region_id = $1`, [id]);
  return r || null;
}

module.exports = { arbol, publicado };
