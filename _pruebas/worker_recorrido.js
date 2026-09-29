// Worker de mentira (mismo protocolo HTTP que services/ai-service/app/worker/embeddings.py) para el recorrido.
// Uso: node worker_recorrido.js registrar   |   node worker_recorrido.js trabajar
// Vectores de juguete: una dirección por especie + ruido; determinista. SOLO base anura_recorrido.
const URL = 'http://127.0.0.1:39230';
const H = { 'Content-Type': 'application/json', 'X-Worker-Token': 'token-prueba-recorrido', 'X-Worker-Name': 'pc-recorrido' };
const ENCODER = '219e860e6fa9a80fb30a59fc8f61911421bbd53a4537dca831803d3ab446b2ad';
const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');
const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_recorrido' });
let s = 99; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
const g = () => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const rand = () => unit(Array.from({ length: 512 }, g));
const dirs = new Map();
const dirDe = (esp, base) => { if (!dirs.has(esp)) dirs.set(esp, esp === 3 ? unit(base.map((x, i) => x + 0.3 * rand()[i])) : rand()); return dirs.get(esp); };
const post = async (p, body) => { const res = await fetch(`${URL}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { status: res.status, body: await res.json().catch(() => ({})) }; };
(async () => {
  if (process.argv[2] === 'registrar') {
    console.log(await post('/api/worker/encoder', {
      contrato: { encoder_sha256: ENCODER, encoder_id: 'bioclip_anura_v1', onnx_export: 'encoder_anura_fp16.onnx', embedding_dimension: 512, preprocessing_version: 'open_clip', normalization_version: 'L2' },
      info: { proveedor: 'CPUExecutionProvider', onnxruntime: '1.20', ms_por_foto: 12 } }));
    return pool.end();
  }
  const { body: { trabajo } } = await post('/api/worker/trabajos/tomar', {});
  console.log('tomado', trabajo);
  if (!trabajo) return pool.end();
  const base = dirDe(2, rand());
  for (;;) {
    const res = await fetch(`${URL}/api/worker/trabajos/${trabajo.id}/lote?limit=16`, { headers: H });
    const lote = await res.json();
    if (!lote.fotos || !lote.fotos.length) break;
    const { rows } = await pool.query('SELECT sha256, especie_id FROM dataset.foto WHERE sha256 = ANY($1)', [lote.fotos]);
    const esp = new Map(rows.map((x) => [x.sha256, x.especie_id]));
    const vectores = lote.fotos.map((sha) => ({ sha256: sha, v: Buffer.from(new Float32Array(unit(dirDe(esp.get(sha), base).map((x) => x + 0.05 * g()))).buffer).toString('base64') }));
    console.log((await post(`/api/worker/trabajos/${trabajo.id}/vectores`, { vectores, mensaje: 'CPU de prueba · 12 ms por foto' })).body);
  }
  console.log((await post(`/api/worker/trabajos/${trabajo.id}/fin`, { estado: 'hecho', mensaje: 'Todas las fotos tienen vector' })).body);
  await pool.end();
})();
