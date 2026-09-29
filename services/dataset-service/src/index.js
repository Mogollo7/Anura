const express = require('express');
const { Pool } = require('pg');
const Minio = require('minio');
const multer = require('multer');
const sharp = require('sharp');
const { requirePanelAction } = require('./panelAuth');
const { registrar: registrarAuditoria } = require('./audit');
const { DEFAULTS, ejecutarLimpieza, decidir } = require('./limpieza');
const curacion = require('./curacion');
const etiquetas = require('./etiquetas');
const especies = require('./especies');
const ficha = require('./ficha');
const altitud = require('./altitud');
const trabajos = require('./trabajos');
const contenido = require('./contenido');
const regiones = require('./regiones');
const manifiesto = require('./manifiesto');
const centroides = require('./centroides');
const paquetes = require('./paquetes');
const validacionTecnica = require('./validacionTecnica');
const release = require('./release');
const vectores = require('./vectores');
const clusteres = require('./clusteres');
const osr = require('./osr');
const evaluacion = require('./evaluacion');
const simulador = require('./simulador');
const clave = require('./clave');

const BUCKET = process.env.DATASET_BUCKET || 'anura-dataset';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Las URLs firmadas llevan el host dentro de la firma: se firman contra la dirección que
// ve el navegador (MINIO_PUBLIC_ENDPOINT), no contra "minio" de la red interna. Con region
// fija el cliente no necesita llamar a MinIO para firmar.
const publicUrl = new URL(process.env.MINIO_PUBLIC_ENDPOINT || 'http://localhost:9000');
const signer = new Minio.Client({
  endPoint: publicUrl.hostname,
  port: Number(publicUrl.port) || (publicUrl.protocol === 'https:' ? 443 : 80),
  useSSL: publicUrl.protocol === 'https:',
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
  region: 'us-east-1',
});
const URL_TTL_S = 600;

// Para escribir se usa la red interna (minio:9000), no la dirección pública.
const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: Number(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
  region: 'us-east-1',
});
const MAX_MB = 25;
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } });

const app = express();
// Los vectores llegan en lotes (512 float32 en base64 por foto): más que el límite por defecto.
app.use(express.json({ limit: '5mb' }));

const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'dataset-service' });
  } catch {
    res.status(503).json({ status: 'error', service: 'dataset-service' });
  }
});

// GET /api/dataset/resumen — conteos reales por especie (Curación, Catálogo, Calidad).
app.get('/api/dataset/resumen', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT e.id, e.carpeta, e.nombre_cientifico, e.genero, e.familia, e.taxon_id,
           COUNT(f.sha256)::int                                              AS fotos,
           COUNT(DISTINCT f.observacion_id)::int                             AS observaciones,
           COUNT(f.sha256) FILTER (WHERE o.latitud IS NOT NULL)::int         AS con_coordenada,
           COUNT(f.sha256) FILTER (WHERE o.coordenada_oculta)::int           AS coordenada_oculta,
           COUNT(f.sha256) FILTER (WHERE f.licencia IS NULL)::int            AS sin_licencia,
           COUNT(f.sha256) FILTER (WHERE f.licencia = 'all-rights-reserved')::int AS derechos_reservados,
           COUNT(f.sha256) FILTER (WHERE f.estado = 'fuera_de_catalogo')::int AS fuera_de_catalogo,
           COUNT(f.sha256) FILTER (WHERE EXISTS (SELECT 1 FROM dataset.exclusion x
             WHERE x.sha256 = f.sha256 AND x.revertida IS NULL))::int         AS excluidas,
           COUNT(f.sha256) FILTER (WHERE f.subida_por IS NOT NULL)::int      AS subidas_a_mano,
           COUNT(vf.sha256) FILTER (WHERE vf.particion = 'train')::int       AS train,
           COUNT(vf.sha256) FILTER (WHERE vf.particion = 'val')::int         AS val,
           COUNT(vf.sha256) FILTER (WHERE vf.particion = 'test')::int        AS test
    FROM dataset.especie e
    LEFT JOIN dataset.foto f ON f.especie_id = e.id
    LEFT JOIN dataset.observacion o ON o.id = f.observacion_id
    LEFT JOIN dataset.version_foto vf ON vf.sha256 = f.sha256
      AND vf.version_id = (SELECT MAX(id) FROM dataset.version)
    GROUP BY e.id
    ORDER BY e.carpeta`);
  const { rows: [version] } = await pool.query(
    'SELECT id, nombre, manifiesto_sha256, creado FROM dataset.version ORDER BY id DESC LIMIT 1');
  const { rows: [exclusiones] } = await pool.query(
    'SELECT COUNT(*)::int AS total FROM dataset.exclusion WHERE revertida IS NULL');
  res.json({ especies: rows, version: version || null, exclusiones: exclusiones.total });
}));

// ── Especies: crear y editar (Admin → Especies). dataset.especie es el único catálogo ──────

// POST /api/dataset/especies { nombre_cientifico: "Género epíteto", familia }
app.post('/api/dataset/especies', requirePanelAction('editarTaxonomia'), ah(async (req, res) => {
  res.status(201).json(await especies.crear(pool, req.body || {}, req.userId));
}));

// PUT /api/dataset/especies/:id { nombre_cientifico?, familia?, aplicar_a_congeneres? }
app.put('/api/dataset/especies/:id', requirePanelAction('editarTaxonomia'), ah(async (req, res) => {
  res.json(await especies.editar(pool, Number(req.params.id), req.body || {}, req.userId));
}));

// GET /api/dataset/especies/:id/fotos?limit=&offset= — la grilla de Curación, con URL firmada.
app.get('/api/dataset/especies/:id/fotos', requirePanelAction('revisarFotografias'), ah(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 48, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  // El picker de foto principal/galería (Contenido) solo puede mostrar fotos con licencia CC:
  // en una especie con miles de fotos, la única CC podía quedar fuera del primer offset=0.
  const soloCc = req.query.solo_cc === 'true';
  // Filtros de Curación, en el servidor por la misma razón: una página de 24 no es toda la especie.
  const FILTROS = {
    activas: 'x.motivo IS NULL',
    excluidas: 'x.motivo IS NOT NULL',
    sin_cc: "(f.licencia IS NULL OR f.licencia = 'all-rights-reserved')",
    aproximada: 'o.coordenada_oculta',
    sin_coordenada: 'o.latitud IS NULL',
    subidas: 'f.subida_por IS NOT NULL',
    train: "vf.particion = 'train'",
    val: "vf.particion = 'val'",
    test: "vf.particion = 'test'",
  };
  const filtro = FILTROS[req.query.filtro] || 'TRUE';
  const { rows } = await pool.query(`
    SELECT f.sha256, f.object_key, f.archivo_original, f.ancho, f.alto, f.licencia, f.atribucion,
           f.url_origen, f.estado, f.subida_por IS NOT NULL AS subida_a_mano,
           o.id AS observacion_id, o.fuente, o.fuente_id AS observacion_inat, o.latitud, o.longitud,
           o.coordenada_oculta, o.coordenada_fuente, o.lugar, o.observada_en, o.invalidada_motivo,
           (SELECT COUNT(*)::int FROM dataset.foto f2 WHERE f2.observacion_id = f.observacion_id) AS fotos_observacion,
           x.motivo AS exclusion_motivo, x.origen AS exclusion_origen, vf.particion
    FROM dataset.foto f
    LEFT JOIN dataset.observacion o ON o.id = f.observacion_id
    LEFT JOIN dataset.version_foto vf ON vf.sha256 = f.sha256
      AND vf.version_id = (SELECT MAX(id) FROM dataset.version)
    LEFT JOIN LATERAL (SELECT motivo, origen FROM dataset.exclusion
      WHERE sha256 = f.sha256 AND revertida IS NULL ORDER BY creado DESC LIMIT 1) x ON TRUE
    WHERE f.especie_id = $1 AND ($4::boolean IS NOT TRUE OR (f.licencia IS NOT NULL AND f.licencia != 'all-rights-reserved'))
      AND ${filtro}
    -- Las fotos de una misma observación quedan juntas: Curación las agrupa por observación.
    ORDER BY f.subida_por IS NULL, o.observada_en DESC NULLS LAST, f.observacion_id, f.archivo_original
    LIMIT $2 OFFSET $3`, [req.params.id, limit, offset, soloCc]);
  const fotos = await Promise.all(rows.map(async (r) => ({
    ...r,
    url: await signer.presignedGetObject(BUCKET, r.object_key, URL_TTL_S),
  })));
  res.json({ fotos, limit, offset });
}));

// ── Curación (Admin → Curación) ──────────────────────────────────────────────────────────

// GET /api/dataset/ubicacion?lat=&lon= — el formulario de subida valida mientras se escribe.
app.get('/api/dataset/ubicacion', requirePanelAction('revisarFotografias'), ah(async (req, res) => {
  const [lat, lon] = curacion.coordenada(req.query.lat, req.query.lon);
  res.json(await curacion.ubicar(lat, lon));
}));

// POST /api/dataset/especies/:id/fotos — multipart: foto, latitud, longitud, coordenada_fuente
// (exif|manual), incertidumbre_m?, observada_en?, licencia, atribucion, confirmar_fuera_de_colombia?
app.post('/api/dataset/especies/:id/fotos', requirePanelAction('revisarFotografias'), subida.single('foto'),
  ah(async (req, res) => {
    const r = await curacion.subirFoto({ pool, minio, bucket: BUCKET }, Number(req.params.id), req.file, req.body || {}, req.userId);
    res.status(201).json(r);
  }));

app.post('/api/dataset/fotos/:sha256/exclusion', requirePanelAction('revisarFotografias'), ah(async (req, res) => {
  await curacion.excluirFoto(pool, req.params.sha256, req.body?.motivo, req.userId);
  res.status(201).json({ ok: true });
}));

app.delete('/api/dataset/fotos/:sha256/exclusion', requirePanelAction('revisarFotografias'), ah(async (req, res) => {
  await curacion.reincluirFoto(pool, req.params.sha256, req.userId);
  res.json({ ok: true });
}));

app.post('/api/dataset/observaciones/:id/invalidacion', requirePanelAction('revisarFotografias'), ah(async (req, res) => {
  res.status(201).json(await curacion.invalidarObservacion(pool, Number(req.params.id), req.body?.motivo, req.userId));
}));

app.delete('/api/dataset/observaciones/:id/invalidacion', requirePanelAction('revisarFotografias'), ah(async (req, res) => {
  res.json(await curacion.revertirInvalidacion(pool, Number(req.params.id), req.userId));
}));

// ── Etiquetas de curación: morfos, estadio y sustrato (bloque 1) ───────────────────────

app.get('/api/dataset/especies/:id/etiquetas', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await etiquetas.deEspecie(pool, Number(req.params.id)));
}));

app.post('/api/dataset/especies/:id/morfos', requirePanelAction('definirMorfo'), ah(async (req, res) => {
  res.status(201).json(await etiquetas.declararMorfo(pool, Number(req.params.id), req.body || {}, req.userId));
}));

app.delete('/api/dataset/morfos/:id', requirePanelAction('definirMorfo'), ah(async (req, res) => {
  res.json(await etiquetas.quitarMorfo(pool, Number(req.params.id), req.userId));
}));

// Cada campo pide su propio permiso dentro de etiquetar(); aquí basta con ser cuenta del panel.
app.put('/api/dataset/observaciones/:id/etiqueta', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await etiquetas.etiquetar(pool, Number(req.params.id), req.body || {}, req.panelAccount, req.userId));
}));

// ── Ficha técnica y altitudes (bloque 2) ───────────────────────────────────────────────

app.get('/api/dataset/especies/:id/ficha', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await ficha.deEspecie(pool, Number(req.params.id)));
}));

// Cada bloque (altitud, pesos, lrc) pide su propio permiso dentro de ajustar().
app.put('/api/dataset/especies/:id/ficha', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await ficha.ajustar(pool, Number(req.params.id), req.body || {}, req.panelAccount, req.userId));
}));

// Rellena por lotes las altitudes que faltan; el cliente repite con desde_id = siguiente_id.
app.post('/api/dataset/altitudes/calcular', requirePanelAction('definirMicrohabitat'), ah(async (req, res) => {
  res.json(await altitud.calcularFaltantes(pool, req.body || {}, req.userId));
}));

// ── Limpieza y decisiones (Admin → Calidad) ─────────────────────────────────────────────

// GET /api/dataset/limpieza — última corrida y cuántos hallazgos quedan por decidir.
app.get('/api/dataset/limpieza', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  const { rows: [ultima] } = await pool.query(
    'SELECT id, parametros, resumen, creado FROM dataset.limpieza_corrida ORDER BY id DESC LIMIT 1');
  const { rows: conteos } = await pool.query(
    'SELECT tipo, estado, COUNT(*)::int AS n FROM dataset.hallazgo GROUP BY tipo, estado ORDER BY tipo, estado');
  const { rows: usos } = await pool.query(`
    SELECT COALESCE(uso_geografico, 'sin_decidir') AS uso, COUNT(*)::int AS n
    FROM dataset.observacion GROUP BY 1 ORDER BY 1`);
  res.json({ ultima: ultima || null, parametros_por_defecto: DEFAULTS, conteos, usos });
}));

// POST /api/dataset/limpieza — corre la limpieza; no toca lo ya decidido.
app.post('/api/dataset/limpieza', requirePanelAction('revisarFotografias'), ah(async (req, res) => {
  const resultado = await ejecutarLimpieza(pool, req.body?.parametros, req.userId);
  await registrarAuditoria(pool, req.userId, 'dataset.limpieza', 'limpieza_corrida', resultado.corrida, resultado);
  res.json(resultado);
}));

// GET /api/dataset/hallazgos?tipo=&estado=&especie_id=&limit=&offset=
app.get('/api/dataset/hallazgos', requirePanelAction('verEspecies'), ah(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const params = [req.query.tipo || null, req.query.estado || 'pendiente', req.query.especie_id ? Number(req.query.especie_id) : null];
  const where = `($1::text IS NULL OR h.tipo = $1) AND h.estado = $2 AND ($3::int IS NULL OR h.especie_id = $3)`;
  const { rows: [{ total }] } = await pool.query(`SELECT COUNT(*)::int AS total FROM dataset.hallazgo h WHERE ${where}`, params);
  const { rows } = await pool.query(`
    SELECT h.id, h.tipo, h.estado, h.detalle, h.propuesta, h.decision, h.motivo, h.decidido_en,
           h.sha256, e.id AS especie_id, e.nombre_cientifico, o.fuente_id AS observacion_inat,
           COALESCE(f.object_key, (SELECT object_key FROM dataset.foto WHERE observacion_id = h.observacion_id LIMIT 1)) AS object_key
    FROM dataset.hallazgo h
    LEFT JOIN dataset.especie e ON e.id = h.especie_id
    LEFT JOIN dataset.observacion o ON o.id = h.observacion_id
    LEFT JOIN dataset.foto f ON f.sha256 = h.sha256
    WHERE ${where}
    ORDER BY e.nombre_cientifico, h.id
    LIMIT ${limit} OFFSET ${offset}`, params);
  const hallazgos = await Promise.all(rows.map(async ({ object_key, ...r }) => ({
    ...r,
    foto_url: object_key ? await signer.presignedGetObject(BUCKET, object_key, URL_TTL_S) : null,
  })));
  res.json({ hallazgos, total, limit, offset });
}));

// POST /api/dataset/hallazgos/decision — {ids | filtro:{tipo, especie_id}, opcion, latitud?, longitud?, motivo?}
app.post('/api/dataset/hallazgos/decision', requirePanelAction('revisarFotografias'), ah(async (req, res) => {
  res.json(await decidir(pool, req.body || {}, req.userId));
}));

// ── Trabajos del worker (M2) ─────────────────────────────────────────────────────────────
// /api/worker/* lo llama model-service con X-Worker-Token (no una cuenta del panel).

app.post('/api/worker/encoder', trabajos.requireWorker, ah(async (req, res) => {
  await trabajos.registrarEncoder(pool, req.worker, req.body);
  res.json({ ok: true });
}));

app.post('/api/worker/trabajos/tomar', trabajos.requireWorker, ah(async (req, res) => {
  const t = await trabajos.tomar(pool, req.worker);
  res.json({ trabajo: t });
}));

app.get('/api/worker/trabajos/:id/lote', trabajos.requireWorker, ah(async (req, res) => {
  res.json(await trabajos.lote(pool, Number(req.params.id), req.worker, Number(req.query.limit) || 32));
}));

app.post('/api/worker/trabajos/:id/vectores', trabajos.requireWorker, ah(async (req, res) => {
  res.json(await trabajos.guardarVectores(pool, Number(req.params.id), req.worker, req.body));
}));

app.post('/api/worker/trabajos/:id/latido', trabajos.requireWorker, ah(async (req, res) => {
  res.json(await trabajos.latido(pool, Number(req.params.id), req.worker, req.body?.mensaje));
}));

app.post('/api/worker/trabajos/:id/fin', trabajos.requireWorker, ah(async (req, res) => {
  res.json(await trabajos.terminar(pool, Number(req.params.id), req.worker, req.body || {}));
}));

app.get('/api/worker/fotos/:sha256', trabajos.requireWorker, ah(async (req, res) => {
  const stream = await trabajos.foto(pool, minio, BUCKET, req.params.sha256);
  res.type('image/jpeg');
  stream.on('error', (err) => res.destroy(err));
  stream.pipe(res);
}));

// Admin → Worker: estado, crear y cancelar trabajos.
app.get('/api/dataset/trabajos', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  res.json(await trabajos.estado(pool));
}));

app.post('/api/dataset/trabajos', requirePanelAction('ejecutarEntrenamiento'), ah(async (req, res) => {
  res.status(201).json(await trabajos.crear(pool, req.body || {}, req.userId));
}));

app.post('/api/dataset/trabajos/:id/cancelar', requirePanelAction('ejecutarEntrenamiento'), ah(async (req, res) => {
  res.json(await trabajos.cancelar(pool, Number(req.params.id), req.userId));
}));

app.get('/api/dataset/trabajos/:id/errores', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await trabajos.errores(pool, Number(req.params.id), Number(req.query.limit) || 100));
}));

// ── DB vectorial (bloque 5): conteos, proyección PCA, metadatos y latencia de pgvector ──
app.get('/api/dataset/vectores', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await vectores.resumen(pool, req.query.encoder || null));
}));

app.get('/api/dataset/vectores/proyeccion', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await vectores.proyeccion(pool, req.query.encoder || null, req.query.por_especie));
}));

app.get('/api/dataset/vectores/metadatos', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await vectores.metadatos(pool, req.query.encoder || null, req.query));
}));

app.post('/api/dataset/vectores/latencia', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await vectores.latencia(pool, req.body?.encoder || null));
}));

// ── Ficha pública / Contenido (K) ────────────────────────────────────────────────────────

// ── Catálogo público (K): lo leen la app y la web sin sesión — solo la copia publicada ──
// Es contenido que ya pasó por el aval del herpetólogo; las fotos solo si son CC y están en
// una ficha publicada. Cualquier origen puede leerlo (la web vive en otro puerto/dominio).
const publico = (_req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
};

// C1: país → departamento → subregión, solo lo publicado en Admin → Release (src/paquetes.js).
// El teléfono y la web bajan el sqlite real desde MinIO, con el sha256 que se calculó al compilar.
app.get('/api/dataset/publico/paquetes', publico, ah(async (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(await paquetes.arbol(pool));
}));

// «Paso a paso» (src/clave.js): clave de identificación armada con los datos de las especies del
// paquete de esa subregión. La app la guarda junto al paquete y la recorre sin conexión.
app.get('/api/dataset/publico/clave', publico, ah(async (req, res) => {
  const c = await clave.deSubregion(pool, req.query.subregion, req.query.version);
  const etag = `"${c.huella}"`;
  res.set('Cache-Control', 'no-cache');
  res.set('ETag', etag);
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.json(c);
}));

app.get('/api/dataset/publico/paquetes/:id/:parte(archivo|manifiesto)', publico, ah(async (req, res) => {
  const p = await paquetes.publicado(pool, req.params.id);
  if (!p) return res.status(404).json({ message: 'Ese paquete no está publicado' });
  const manifiestoPedido = req.params.parte === 'manifiesto';
  res.set('Cache-Control', 'no-cache');
  res.set('ETag', `"${p.sha256}${manifiestoPedido ? '-json' : ''}"`);
  if (req.headers['if-none-match'] === res.get('ETag')) return res.status(304).end();
  res.type(manifiestoPedido ? 'application/json' : 'application/vnd.sqlite3');
  if (!manifiestoPedido) res.set('Content-Length', String(p.size_bytes));
  const stream = await minio.getObject(BUCKET, manifiestoPedido ? p.manifiesto_key : p.storage_key);
  stream.on('error', (err) => res.destroy(err));
  stream.pipe(res);
}));

// ── Validación técnica y Release (bloque 4): compilar, aprobar y publicar en el servidor ──
app.get('/api/dataset/validacion', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  res.json(await validacionTecnica.resumen(pool));
}));

app.get('/api/dataset/validacion/:subregionId', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await validacionTecnica.evaluar(pool, Number(req.params.subregionId)));
}));

app.get('/api/dataset/releases', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await release.listar(pool, req.query.subregion_id ? Number(req.query.subregion_id) : null));
}));

app.post('/api/dataset/releases', requirePanelAction('generarPaquete'), ah(async (req, res) => {
  const subregionId = Number(req.body?.subregion_id);
  if (!Number.isInteger(subregionId)) return res.status(400).json({ message: 'Elige la subregión que quieres compilar' });
  res.status(201).json(await release.compilar({ pool, minio, bucket: BUCKET }, subregionId, req.panelAccount, req.userId));
}));

// Cada tipo pide su permiso dentro de aprobar(): científica → aprobarCientifico, técnica → publicarPaquete.
app.post('/api/dataset/releases/:id/aprobaciones', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.status(201).json(await release.aprobar(pool, Number(req.params.id), req.body?.tipo, req.panelAccount, req.userId));
}));

app.post('/api/dataset/releases/:id/publicar', requirePanelAction('publicarPaquete'), ah(async (req, res) => {
  res.json(await release.publicar(pool, Number(req.params.id), req.panelAccount, req.userId));
}));

app.get('/api/dataset/publico/catalogo', publico, ah(async (req, res) => {
  const cat = await contenido.catalogo(pool);
  const f = await manifiesto.firmado(cat);
  const etag = `"${f.version}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  // El texto exacto que se firmó (manifiesto.js), no una nueva serialización: tienen que ser
  // los mismos bytes para que el sha256 del manifiesto sea el sha256 de lo que de verdad llega.
  res.type('application/json').send(f.cuerpoTexto);
}));

// K2: manifest + sha256 + firma Ed25519 — mismo mecanismo que va a usar C1, canal propio.
// La app y la web verifican la firma con una clave pública embebida (nunca la piden a este
// mismo servidor) antes de aceptar el catálogo que bajen de /api/dataset/publico/catalogo.
app.get('/api/dataset/publico/manifiesto', publico, ah(async (req, res) => {
  const cat = await contenido.catalogo(pool);
  const f = await manifiesto.firmado(cat);
  if (!f.firma) {
    console.error('CONTENT_MANIFEST_PRIVATE_KEY_B64 no configurada: el manifiesto sale sin firma.');
  }
  res.set('Cache-Control', 'no-cache');
  res.json({
    formato: 1,
    canal: 'contenido',
    version: f.version,
    sha256: f.sha256,
    tamano: Buffer.byteLength(f.cuerpoTexto),
    generado: f.generado,
    firma: f.firma,
    url: '/api/dataset/publico/catalogo',
  });
}));

// ?ancho=320|640|1080 — tamaños fijos: el sha256 no cambia, así que cada tamaño se cachea para siempre.
const ANCHOS = [320, 640, 1080];
app.get('/api/dataset/publico/fotos/:sha256', publico, ah(async (req, res) => {
  if (!/^[0-9a-f]{64}$/.test(req.params.sha256)) return res.status(404).json({ message: 'Foto no publicada' });
  const f = await contenido.fotoPublica(pool, req.params.sha256);
  if (!f) return res.status(404).json({ message: 'Foto no publicada' });
  const pedido = Number(req.query.ancho) || 1080;
  const ancho = ANCHOS.find((a) => a >= pedido) || ANCHOS[ANCHOS.length - 1];
  const partes = [];
  for await (const trozo of await minio.getObject(BUCKET, f.object_key)) partes.push(trozo);
  const jpg = await sharp(Buffer.concat(partes)).rotate().resize({ width: ancho, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('jpeg').send(jpg);
}));

// ── Regiones (Admin → Regiones): departamentos y subregiones ─────────────────────────────

app.get('/api/dataset/regiones', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await regiones.listar(pool, req.query.geometria === '1'));
}));

app.post('/api/dataset/regiones', requirePanelAction('generarPaquete'), ah(async (req, res) => {
  res.status(201).json(await regiones.agregar(pool, String(req.body?.codigo_dane ?? ''), req.userId));
}));

app.get('/api/dataset/regiones/:codigo', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await regiones.detalle(pool, req.params.codigo));
}));

app.delete('/api/dataset/regiones/:codigo', requirePanelAction('generarPaquete'), ah(async (req, res) => {
  res.json(await regiones.quitar(pool, req.params.codigo, req.userId));
}));

app.post('/api/dataset/regiones/:codigo/activar', requirePanelAction('generarPaquete'), ah(async (req, res) => {
  res.json(await regiones.activar(pool, req.params.codigo, req.userId));
}));

app.post('/api/dataset/regiones/:codigo/subregiones', requirePanelAction('generarPaquete'), ah(async (req, res) => {
  res.status(201).json(await regiones.crearSubregion(pool, req.params.codigo, req.body?.nombre, req.userId));
}));

app.put('/api/dataset/regiones/:codigo/subregiones/:id', requirePanelAction('generarPaquete'), ah(async (req, res) => {
  res.json(await regiones.renombrarSubregion(pool, Number(req.params.id), req.body?.nombre, req.userId));
}));

app.delete('/api/dataset/regiones/:codigo/subregiones/:id', requirePanelAction('generarPaquete'), ah(async (req, res) => {
  res.json(await regiones.borrarSubregion(pool, Number(req.params.id), req.userId));
}));

// { municipios: ['05001', …] } → esos municipios pasan a la subregión :id
app.post('/api/dataset/regiones/:codigo/subregiones/:id/municipios', requirePanelAction('generarPaquete'), ah(async (req, res) => {
  res.json(await regiones.asignarMunicipios(pool, req.params.codigo, Number(req.params.id), req.body?.municipios, req.userId));
}));

app.get('/api/dataset/contenido', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  res.json({ especies: await contenido.listar(pool) });
}));

app.get('/api/dataset/contenido/catalogo', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  res.json(await contenido.catalogo(pool));
}));

app.get('/api/dataset/contenido/:especieId', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await contenido.ficha(pool, Number(req.params.especieId)));
}));

app.put('/api/dataset/contenido/:especieId', requirePanelAction('editarContenido'), ah(async (req, res) => {
  res.json(await contenido.guardar(pool, Number(req.params.especieId), req.body || {}, req.userId));
}));

app.post('/api/dataset/contenido/:especieId/revision', requirePanelAction('editarContenido'), ah(async (req, res) => {
  res.json(await contenido.enviarRevision(pool, Number(req.params.especieId), req.userId));
}));

app.post('/api/dataset/contenido/:especieId/borrador', requirePanelAction('editarContenido'), ah(async (req, res) => {
  res.json(await contenido.devolverBorrador(pool, Number(req.params.especieId), req.body?.motivo, req.userId));
}));

app.post('/api/dataset/contenido/:especieId/publicar', requirePanelAction('publicarContenido'), ah(async (req, res) => {
  res.json(await contenido.publicar(pool, Number(req.params.especieId), req.userId));
}));

// ── Destacados (carrusel de inicio) ──────────────────────────────────────────────────────

app.get('/api/dataset/destacados', requirePanelAction('verEspecies'), ah(async (req, res) => {
  // Fecha de Colombia (UTC−5 fijo, sin horario de verano), no la del reloj UTC del servidor.
  const diaBogota = (ms) => new Date(ms - 5 * 3600000).toISOString().slice(0, 10);
  const desde = req.query.desde || diaBogota(Date.now());
  const hasta = req.query.hasta || diaBogota(Date.now() + 30 * 86400000);
  res.json({ destacados: await contenido.calendario(pool, desde, hasta) });
}));

app.get('/api/dataset/destacados/elegibles/:categoria', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json({ especies: await contenido.elegiblesPara(pool, req.params.categoria) });
}));

app.post('/api/dataset/destacados', requirePanelAction('editarContenido'), ah(async (req, res) => {
  res.status(201).json(await contenido.programar(pool, req.body || {}, req.userId));
}));

app.delete('/api/dataset/destacados/:id', requirePanelAction('editarContenido'), ah(async (req, res) => {
  res.json(await contenido.quitarProgramado(pool, Number(req.params.id), req.userId));
}));

// ── Centroides reales (M3) ───────────────────────────────────────────────────────────────
app.get('/api/dataset/centroides', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  res.json(await centroides.ultimo(pool));
}));

app.post('/api/dataset/centroides', requirePanelAction('ejecutarEntrenamiento'), ah(async (req, res) => {
  res.status(201).json(await centroides.calcular(pool, req.userId));
}));

app.get('/api/dataset/centroides/morfos', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  res.json(await centroides.morfos(pool));
}));

// ── Clústeres (bloque 5): matriz de confusión real y decisiones de la persona ──────────
app.get('/api/dataset/clusteres', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await clusteres.panorama(pool, req.query));
}));

app.post('/api/dataset/clusteres', requirePanelAction('crearComplejo'), ah(async (req, res) => {
  res.status(201).json(await clusteres.decidir(pool, req.body || {}, req.userId));
}));

app.delete('/api/dataset/clusteres/:id', requirePanelAction('crearComplejo'), ah(async (req, res) => {
  res.json(await clusteres.retirar(pool, Number(req.params.id), req.userId));
}));

// ── OSR, Métricas y Simulador (bloque 6): umbral de rechazo, evaluación y una foto ─────
// OSR: el servidor calibra (Mahalanobis + Ledoit-Wolf, como el teléfono) y una persona valida.
app.get('/api/dataset/osr', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await osr.estado(pool, osr.leerSubregion(req.query.subregion_id)));
}));

// Solo la lista de paquetes (para elegir uno en OSR, Métricas y Simulador).
app.get('/api/dataset/osr/paquetes', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  res.json({ paquetes: await osr.paquetes(pool, await osr.vigente(pool)) });
}));

app.post('/api/dataset/osr/calibraciones', requirePanelAction('configurarOSR'), ah(async (req, res) => {
  res.status(201).json(await osr.calibrar(pool, req.body || {}, req.userId));
}));

app.post('/api/dataset/osr/validaciones', requirePanelAction('configurarOSR'), ah(async (req, res) => {
  res.status(201).json(await osr.validar(pool, req.body || {}, req.panelAccount, req.userId));
}));

// Métricas: top-1/top-3 en la partición test contra los centroides vigentes de cada paquete.
app.get('/api/dataset/evaluaciones', requirePanelAction('verEspecies'), ah(async (_req, res) => {
  res.json(await evaluacion.listar(pool));
}));

app.get('/api/dataset/evaluaciones/:id', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await evaluacion.detalle(pool, Number(req.params.id)));
}));

app.post('/api/dataset/evaluaciones', requirePanelAction('ejecutarEntrenamiento'), ah(async (req, res) => {
  res.status(201).json(await evaluacion.evaluar(pool, req.body || {}, req.userId));
}));

// Simulador: solo lee. Fotos que ya tienen vector (el servidor no embebe fotos nuevas).
app.get('/api/dataset/simulador', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await simulador.opciones(pool, osr.leerSubregion(req.query.subregion_id)));
}));

app.get('/api/dataset/simulador/fotos', requirePanelAction('verEspecies'), ah(async (req, res) => {
  const firmar = (key) => signer.presignedGetObject(BUCKET, key, URL_TTL_S);
  res.json(await simulador.fotos(pool, firmar, Number(req.query.especie_id), Number(req.query.offset) || 0));
}));

app.post('/api/dataset/simulador/identificar', requirePanelAction('verEspecies'), ah(async (req, res) => {
  res.json(await simulador.identificar(pool, req.body || {}));
}));

app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: `La foto pesa más de ${MAX_MB} MB` });
  if (err instanceof multer.MulterError) return res.status(400).json({ message: 'Sube una sola foto en el campo "foto"' });
  if (err.status && err.status < 500 || err.status === 502) {
    return res.status(err.status).json({ message: err.message, ...(err.codigo ? { codigo: err.codigo, ubicacion: err.ubicacion } : {}), ...(err.detalle ? { detalle: err.detalle } : {}), ...(err.motivos ? { motivos: err.motivos } : {}) });
  }
  console.error(err);
  res.status(500).json({ message: 'Error interno de dataset-service' });
});

const PORT = process.env.PORT || 3008;
app.listen(PORT, () => console.log(`dataset-service running on :${PORT}`));
