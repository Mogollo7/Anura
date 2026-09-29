// Pruebas de la clave «Paso a paso» (src/clave.js) contra la base desechable anura_clave.
// Uso: node prueba_clave.js   (antes: sh bd_prueba.sh anura_clave)
const { Pool } = require('D:/server/Anura/services/dataset-service/node_modules/pg');
const clave = require('D:/server/Anura/services/dataset-service/src/clave.js');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_clave' });
const q = (s, p) => pool.query(s, p);

async function espera(promesa, status) {
  try { await promesa; } catch (e) { assert.strictEqual(e.status, status, `esperaba ${status}, llegó ${e.status}: ${e.message}`); return e.message; }
  throw new Error(`esperaba error ${status} y no falló`);
}

// Ganancia escrita de otra forma (por conteo de pares de respuesta), para comprobar la del módulo.
function gananciaIndependiente(car, especies) {
  const n = especies.length;
  if (n <= 1) return 0;
  const todas = car.opciones.map((o) => o.id);
  const comp = especies.map((s) => (s.estados[car.id] && s.estados[car.id].length ? s.estados[car.id] : todas));
  let h = 0;
  for (const a of todas) {
    const pa = comp.reduce((acc, c) => acc + (c.includes(a) ? 1 / (n * c.length) : 0), 0);
    const tam = comp.filter((c) => c.includes(a)).length;
    if (pa > 0) h += pa * Math.log2(tam);
  }
  return Math.log2(n) - h;
}

let sha = 0;
const nuevoSha = () => (++sha).toString(16).padStart(64, '0');

// Especie con N individuos (observaciones con foto) y, opcionalmente, el sustrato de cada uno.
async function especie(carpeta, nombre, taxon, sustratos = []) {
  const [genero] = nombre.split(' ');
  const { rows: [e] } = await q(
    `INSERT INTO dataset.especie (carpeta, nombre_cientifico, genero, familia, taxon_id) VALUES ($1, $2, $3, 'Pruebidae', $4) RETURNING id`,
    [carpeta, nombre, genero, taxon]);
  for (const s of sustratos) {
    const { rows: [o] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id) VALUES ('manual', $1) RETURNING id`, [`${carpeta}-${sha}`]);
    const h = nuevoSha();
    await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado)
             VALUES ($1, $2, $3, $4, 'x.jpg', 'catalogo')`, [h, `k/${h}`, e.id, o.id]);
    if (s) await q('INSERT INTO dataset.observacion_etiqueta (observacion_id, sustrato) VALUES ($1, $2)', [o.id, s]);
  }
  return e.id;
}

const rep = (v, n) => Array(n).fill(v);

(async () => {
  // Base limpia para que la prueba se pueda repetir.
  await q(`TRUNCATE packages.regional_packages, dataset.observacion_etiqueta, dataset.morfo, dataset.species_content,
           dataset.foto, dataset.observacion, dataset.especie RESTART IDENTITY CASCADE`);
  await q(`UPDATE dataset.region SET estado = 'activa' WHERE codigo_dane = '05'`);
  const { rows: [valle] } = await q(`SELECT id FROM dataset.subregion WHERE region = '05' AND clave = 'VALLE_DE_ABURRA'`);
  const { rows: [oriente] } = await q(`SELECT id FROM dataset.subregion WHERE region = '05' AND clave = 'ORIENTE'`);

  // ── Fixtures: 6 especies en el paquete + 1 fuera (no debe aparecer) ─────────────────
  const A = await especie('Alpha_alta', 'Alpha alta', 'COL_T_0001', rep('hojarasca', 6));
  const B = await especie('Alpha_baja', 'Alpha baja', 'COL_T_0002', rep('quebrada', 5));
  const C = await especie('Beta_media', 'Beta media', 'COL_T_0003', [...rep('vegetacion', 4), 'roca']);
  const D = await especie('Gemela_uno', 'Gemela uno', 'COL_T_0004', rep('hojarasca', 5));
  const E = await especie('Gemela_dos', 'Gemela dos', 'COL_T_0005', rep('hojarasca', 5));
  const G = await especie('Pocas_etiquetas', 'Pocas etiquetas', 'COL_T_0006', ['roca', 'roca', null, null, null]);
  const H = await especie('Fuera_paquete', 'Fuera paquete', 'COL_T_0099', rep('roca', 6));
  // Una observación invalidada de A en roca: no cuenta.
  {
    const { rows: [o] } = await q(`INSERT INTO dataset.observacion (fuente, fuente_id, invalidada_en, invalidada_motivo) VALUES ('manual', 'inv', NOW(), 'prueba') RETURNING id`);
    const h = nuevoSha();
    await q(`INSERT INTO dataset.foto (sha256, object_key, especie_id, observacion_id, archivo_original, estado) VALUES ($1, $2, $3, $4, 'x.jpg', 'catalogo')`, [h, `k/${h}`, A, o.id]);
    await q('INSERT INTO dataset.observacion_etiqueta (observacion_id, sustrato) VALUES ($1, $2)', [o.id, 'roca']);
  }
  // Morfos: en el Valle; D y E con el mismo nombre escrito distinto; A tiene otro en Oriente (no cuenta).
  for (const [id, nombre, sub] of [[A, 'Rojo', valle.id], [B, 'Verde', valle.id], [D, 'rojo', valle.id], [E, 'Rójo ', valle.id],
    [A, 'Azul', oriente.id], [H, 'Negro', valle.id]]) {
    await q('INSERT INTO dataset.morfo (especie_id, subregion_id, nombre) VALUES ($1, $2, $3)', [id, sub, nombre]);
  }
  // Ficha pública: solo cuenta la copia PUBLICADA (C tiene un borrador distinto encima).
  const ficha = async (id, publicada, borrador = publicada) => q(
    `INSERT INTO dataset.species_content (especie_id, estado, campos, publicada) VALUES ($1, $2, $3, $4)`,
    [id, publicada ? 'publicada' : 'borrador', borrador, publicada ? { campos: publicada, galeria: [] } : null]);
  await ficha(A, { actividad: 'nocturna', nombre_comun: { valor: 'Rana alta', fuente: 'x' } });
  await ficha(B, { actividad: 'nocturna', lhc: { min: 40, max: 60, fuente: 'x' } });
  await ficha(C, { actividad: 'diurna' }, { actividad: 'nocturna' });
  await ficha(D, { actividad: 'nocturna' });
  await ficha(E, { actividad: 'nocturna' });
  await ficha(G, { actividad: 'diurna', lhc: { min: 10, max: 15, fuente: 'x' }, altitud_literatura: { min: 0, max: 1000, fuente: 'x' } });
  await ficha(H, { actividad: 'diurna' });

  // Paquete: v1 retirado (solo A y B), v2 publicado (las 6). El contexto es el de la Ficha técnica.
  const esp = (taxon, nombre, contexto) => ({ taxon_id: taxon, nombre_cientifico: nombre, genero: nombre.split(' ')[0], familia: 'Pruebidae', contexto });
  const alt = (min, max, origen = 'calculado') => ({ min, max, origen });
  const manifiesto2 = {
    especies: [
      esp('COL_T_0001', 'Alpha alta', { altitud: alt(2000, 3000, 'manual'), lrc: { metodo: 'manual', min: 20, max: 30 } }),
      esp('COL_T_0002', 'Alpha baja', { altitud: alt(0, 1000), lrc: { metodo: 'pendiente', min: null, max: null } }),
      esp('COL_T_0003', 'Beta media', { altitud: alt(1000, 2000), lrc: { metodo: 'manual', min: 20, max: 30 } }),
      esp('COL_T_0004', 'Gemela uno', { altitud: alt(1000, 2000), lrc: { metodo: 'pendiente' } }),
      esp('COL_T_0005', 'Gemela dos', { altitud: alt(1000, 2000), lrc: { metodo: 'pendiente' } }),
      esp('COL_T_0006', 'Pocas etiquetas', { altitud: null, lrc: { metodo: 'pendiente' } }),
    ],
  };
  const manifiesto1 = { especies: manifiesto2.especies.slice(0, 2) };
  await q(`INSERT INTO packages.regional_packages (region_id, version, storage_key, sha256, size_bytes, subregion_id, estado, especies, manifiesto)
           VALUES ('05.VALLE_DE_ABURRA', 1, 'k1', 'sha-v1', 10, $1, 'retirado', 2, $2),
                  ('05.VALLE_DE_ABURRA', 2, 'k2', 'sha-v2', 20, $1, 'publicado', 6, $3)`, [valle.id, manifiesto1, manifiesto2]);

  // ── Lectura ──────────────────────────────────────────────────────────────────────────
  const k = await clave.deSubregion(pool, '05.VALLE_DE_ABURRA');
  assert.strictEqual(k.formato, 1);
  assert.deepStrictEqual([k.paquete.id, k.paquete.version, k.paquete.sha256], ['05.VALLE_DE_ABURRA', 2, 'sha-v2']);
  assert.strictEqual(k.subregion.nombre, 'Valle de Aburrá');
  assert.deepStrictEqual(k.especies.map((s) => s.taxon_id).sort(), ['COL_T_0001', 'COL_T_0002', 'COL_T_0003', 'COL_T_0004', 'COL_T_0005', 'COL_T_0006'],
    'solo las especies del paquete, sin relleno');
  const porId = Object.fromEntries(k.especies.map((s) => [s.taxon_id, s]));
  const car = Object.fromEntries(k.caracteres.map((c) => [c.id, c]));
  console.log('caracteres:', k.caracteres.map((c) => `${c.id}=${c.ganancia_bits}`).join(', '));
  for (const c of k.caracteres) console.log(`  ${c.id}: ${c.opciones.map((o) => o.etiqueta).join(' | ')}`);

  // Mismo parámetro por id numérico de subregión.
  assert.strictEqual((await clave.deSubregion(pool, String(valle.id))).huella, k.huella);
  // Una versión anterior (retirada) sigue sirviendo SU clave: solo sus especies.
  const k1 = await clave.deSubregion(pool, '05.VALLE_DE_ABURRA', '1');
  assert.deepStrictEqual(k1.especies.map((s) => s.taxon_id).sort(), ['COL_T_0001', 'COL_T_0002']);
  await espera(clave.deSubregion(pool, '05.ORIENTE'), 404);
  await espera(clave.deSubregion(pool, '05.VALLE_DE_ABURRA', '7'), 404);
  await espera(clave.deSubregion(pool, ''), 400);
  await espera(clave.deSubregion(pool, '05.VALLE_DE_ABURRA', 'uno'), 400);

  // Datos: sustrato solo con ≥ 5 individuos etiquetados (G tiene 2: sin dato); invalidada no cuenta.
  assert.deepStrictEqual(porId.COL_T_0001.estados.sustrato, ['hojarasca'], 'la observación invalidada en roca no cuenta');
  assert.deepStrictEqual(porId.COL_T_0003.estados.sustrato, ['vegetacion', 'roca']);
  assert.strictEqual(porId.COL_T_0006.estados.sustrato, undefined, 'con 2 etiquetas no hay dato de sustrato');
  // Actividad: la publicada, no el borrador.
  assert.deepStrictEqual(porId.COL_T_0003.estados.actividad, ['dia']);
  // Morfo: D y E comparten "rojo" con A (mayúsculas y tildes no cuentan); Azul (Oriente) y Negro (fuera) no están.
  assert.deepStrictEqual(car.morfo.opciones.map((o) => o.etiqueta), ['Rojo', 'Verde']);
  assert.deepStrictEqual(porId.COL_T_0004.estados.morfo, porId.COL_T_0001.estados.morfo);
  assert.deepStrictEqual(porId.COL_T_0005.estados.morfo, porId.COL_T_0001.estados.morfo);
  // Tamaño: LRC manual de la Ficha técnica, si no la LHC publicada.
  assert.ok(porId.COL_T_0002.resumen.tamano.startsWith('40–60'));
  assert.ok(porId.COL_T_0006.resumen.tamano.startsWith('10–15'));
  assert.strictEqual(porId.COL_T_0004.estados.tamano, undefined);
  // Altitud de G sale de la literatura publicada (el paquete no la trae).
  assert.strictEqual(porId.COL_T_0006.resumen.altitud, '0–1.000 m');
  assert.strictEqual(porId.COL_T_0001.resumen.altitud, '2.000–3.000 m');

  // ── Ganancia: el orden es el de mayor ganancia y coincide con otra implementación ─────
  for (const c of k.caracteres) {
    const g = gananciaIndependiente(c, k.especies);
    assert.ok(Math.abs(g - clave.ganancia(c, k.especies)) < 1e-9, `ganancia de ${c.id}`);
    assert.ok(Math.abs(Math.round(g * 1000) / 1000 - c.ganancia_bits) < 1e-9);
  }
  for (let i = 1; i < k.caracteres.length; i++) assert.ok(k.caracteres[i - 1].ganancia_bits >= k.caracteres[i].ganancia_bits);
  const primera = clave.resolver(k, []);
  const mejor = [...k.caracteres].sort((a, b) => gananciaIndependiente(b, k.especies) - gananciaIndependiente(a, k.especies))[0];
  assert.strictEqual(primera.estado, 'pregunta');
  assert.strictEqual(primera.siguiente, mejor.id, 'la primera pregunta es la de mayor ganancia');
  assert.strictEqual(primera.siguiente, k.caracteres[0].id);
  console.log('primera pregunta:', primera.siguiente, primera.ganancia.toFixed(3), 'bits');

  // ── "No sé" no filtra y pasa a la siguiente ────────────────────────────────────────────
  const noSe = clave.resolver(k, [{ caracter: primera.siguiente, opcion: null }]);
  assert.strictEqual(noSe.especies.length, 6, '"no sé" no descarta especies');
  assert.notStrictEqual(noSe.siguiente, primera.siguiente);

  // ── Las respuestas filtran bien ────────────────────────────────────────────────────────
  const banda = (c, v) => c.opciones.find((o) => (o.desde == null || o.desde <= v) && (o.hasta == null || v < o.hasta)).id;
  const alta = clave.resolver(k, [{ caracter: 'altitud', opcion: banda(car.altitud, 2500) }]);
  assert.deepStrictEqual(alta.especies, ['COL_T_0001'], 'a 2.500 m solo queda Alpha alta');
  assert.strictEqual(alta.estado, 'una');
  const noche = clave.resolver(k, [{ caracter: 'actividad', opcion: 'noche' }]);
  assert.deepStrictEqual(noche.especies.sort(), ['COL_T_0001', 'COL_T_0002', 'COL_T_0004', 'COL_T_0005']);
  const roca = clave.resolver(k, [{ caracter: 'sustrato', opcion: 'roca' }]);
  assert.deepStrictEqual(roca.especies.sort(), ['COL_T_0003', 'COL_T_0006'], 'G sin dato de sustrato no se descarta');
  const ninguna = clave.resolver(k, [{ caracter: 'altitud', opcion: banda(car.altitud, 2500) }, { caracter: 'actividad', opcion: 'dia' }]);
  assert.strictEqual(ninguna.estado, 'ninguna');
  assert.deepStrictEqual(ninguna.especies, []);
  assert.throws(() => clave.resolver(k, [{ caracter: 'color_ojos', opcion: 'x' }]));

  // ── Recorrido completo como alguien que vio cada especie (responde lo que ella tiene) ──
  function recorrer(taxon) {
    const s = porId[taxon];
    const resp = [];
    for (let i = 0; i < 10; i++) {
      const r = clave.resolver(k, resp);
      if (r.estado !== 'pregunta') return { r, preguntas: resp.map((x) => x.caracter) };
      const opc = s.estados[r.siguiente];
      resp.push({ caracter: r.siguiente, opcion: opc ? opc[0] : null });
    }
    throw new Error('la clave no terminó');
  }
  for (const t of ['COL_T_0001', 'COL_T_0002', 'COL_T_0003', 'COL_T_0006']) {
    const { r, preguntas } = recorrer(t);
    assert.strictEqual(r.estado, 'una', `${t} se identifica sola`);
    assert.deepStrictEqual(r.especies, [t]);
    console.log(`  ${porId[t].nombre_cientifico}: ${preguntas.join(' → ')} → una`);
  }
  // Las gemelas (mismos datos en todo) quedan juntas y la clave lo dice.
  const gem = recorrer('COL_T_0004');
  assert.strictEqual(gem.r.estado, 'varias');
  assert.deepStrictEqual([...gem.r.especies].sort(), ['COL_T_0004', 'COL_T_0005']);
  assert.strictEqual(gem.r.indistinguibles, true);
  assert.deepStrictEqual(gem.r.pendientes, []);
  console.log(`  Gemelas: ${gem.preguntas.join(' → ')} → varias, indistinguibles`);
  // Con "no sé" en algo que las separaría, quedan varias y se dice qué pregunta falta.
  const falta = clave.resolver(k, [{ caracter: 'altitud', opcion: null }, { caracter: 'actividad', opcion: 'noche' },
    { caracter: 'sustrato', opcion: null }, { caracter: 'morfo', opcion: null }, { caracter: 'tamano', opcion: null }]);
  assert.strictEqual(falta.estado, 'varias');
  assert.strictEqual(falta.indistinguibles, false);
  assert.ok(falta.pendientes.includes('altitud'));

  // ── Especie sin ningún dato: siempre queda (sin dato nunca descarta) ──────────────────
  const pura = clave.construirClave([
    { taxon_id: 'X1', nombre_cientifico: 'X uno', genero: 'X', familia: 'F', altitud: { min: 0, max: 500 }, actividad: 'diurna' },
    { taxon_id: 'X2', nombre_cientifico: 'X dos', genero: 'X', familia: 'F', altitud: { min: 1500, max: 2500 }, actividad: 'nocturna' },
    { taxon_id: 'X3', nombre_cientifico: 'X tres', genero: 'X', familia: 'F' },
  ]);
  const band2 = pura.caracteres.find((c) => c.id === 'altitud');
  const rX = clave.resolver(pura, [{ caracter: 'altitud', opcion: banda(band2, 2000) }, { caracter: 'actividad', opcion: 'noche' }]);
  assert.deepStrictEqual(rX.especies, ['X2', 'X3'], 'X3 sin datos sigue compatible, ordenada después');
  assert.strictEqual(rX.indistinguibles, true);
  // Sin especies con datos no hay caracteres (la app muestra que la clave no tiene preguntas).
  assert.deepStrictEqual(clave.construirClave([{ taxon_id: 'Y', nombre_cientifico: 'Y y', genero: 'Y', familia: 'F' }]).caracteres, []);
  assert.strictEqual(clave.numero(1234.5), '1.234,5');
  assert.strictEqual(clave.numero(20), '20');

  // Reproducible: dos lecturas seguidas dan la misma huella.
  assert.strictEqual((await clave.deSubregion(pool, '05.VALLE_DE_ABURRA')).huella, k.huella);

  // Caso compartido con la prueba de Kotlin (IdentificationKeyTest): la clave y los recorridos esperados.
  const destino = process.argv[2];
  if (destino) {
    const casos = ['COL_T_0001', 'COL_T_0002', 'COL_T_0003', 'COL_T_0004', 'COL_T_0006'].map((t) => {
      const { r, preguntas } = recorrer(t);
      return { taxon_id: t, preguntas, estado: r.estado, especies: r.especies, indistinguibles: r.indistinguibles ?? null };
    });
    const { generado, ...estable } = k;
    fs.writeFileSync(destino, `${JSON.stringify({ clave: estable, primera: primera.siguiente, casos }, null, 2)}\n`);
    console.log('caso compartido escrito en', path.resolve(destino));
  }

  console.log('TODAS LAS PRUEBAS PASARON');
  await pool.end();
})().catch(async (e) => { console.error('FALLÓ:', e.stack || e.message); await pool.end(); process.exit(1); });
