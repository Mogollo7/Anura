// Worker de prueba por HTTP (mismo protocolo que services/ai-service/app/worker/embeddings.py).
const URL = 'http://127.0.0.1:39140';
const H = { 'Content-Type': 'application/json', 'X-Worker-Token': 'token-prueba-vectores', 'X-Worker-Name': 'pc-rtx4050' };
let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
const g = () => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const dir = unit(Array.from({ length: 512 }, g));
(async () => {
  const { trabajo } = await (await fetch(`${URL}/api/worker/trabajos/tomar`, { method: 'POST', headers: H, body: '{}' })).json();
  console.log('tomado', trabajo);
  for (;;) {
    const lote = await (await fetch(`${URL}/api/worker/trabajos/${trabajo.id}/lote?limit=8`, { headers: H })).json();
    if (!lote.fotos.length) break;
    const vectores = lote.fotos.map((sha) => ({ sha256: sha, v: Buffer.from(new Float32Array(unit(dir.map((x) => x + 0.03 * g()))).buffer).toString('base64') }));
    console.log(await (await fetch(`${URL}/api/worker/trabajos/${trabajo.id}/vectores`, { method: 'POST', headers: H, body: JSON.stringify({ vectores, mensaje: 'CUDA · 9 ms por foto' }) })).json());
  }
  console.log(await (await fetch(`${URL}/api/worker/trabajos/${trabajo.id}/fin`, { method: 'POST', headers: H, body: JSON.stringify({ estado: 'hecho', mensaje: 'Todas las fotos tienen vector' }) })).json());
})();
