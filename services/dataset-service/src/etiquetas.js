/**
 * Etiquetas de curación (Admin → Imágenes, Ficha, Centroides): morfos declarados por especie
 * y subregión, y por cada observación del dataset su estadio, sustrato y morfo. Cada campo
 * pide su propio permiso del panel; todo cambio queda en audit.log.
 */
const { registrar } = require('./audit');

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const ESTADIOS = ['adulto', 'juvenil', 'metamorfico', 'larva', 'desconocido'];
const SUSTRATOS = ['hojarasca', 'vegetacion', 'quebrada', 'roca'];
const PERMISO = { estadio: 'validarEstadio', sustrato: 'definirMicrohabitat', morfo_id: 'definirMorfo' };

const puede = (account, accion) => account.isSuperAdmin || !!account.permissions?.[accion];

/** GET /api/dataset/especies/:id/etiquetas — morfos de la especie y etiquetas de sus observaciones. */
async function deEspecie(pool, especieId) {
  const { rows: [especie] } = await pool.query('SELECT id FROM dataset.especie WHERE id = $1', [especieId]);
  if (!especie) throw falla('La especie no existe en el dataset', 404);
  const { rows: morfos } = await pool.query(
    `SELECT m.id, m.subregion_id, s.nombre AS subregion, s.region, m.nombre, m.nota, m.creado,
            (SELECT COUNT(*)::int FROM dataset.observacion_etiqueta e WHERE e.morfo_id = m.id) AS individuos
     FROM dataset.morfo m JOIN dataset.subregion s ON s.id = m.subregion_id
     WHERE m.especie_id = $1 ORDER BY s.numero, m.nombre`,
    [especieId]
  );
  const { rows: observaciones } = await pool.query(
    `SELECT e.observacion_id, e.estadio, e.sustrato, e.morfo_id, e.actualizado
     FROM dataset.observacion_etiqueta e
     WHERE e.observacion_id IN (SELECT DISTINCT observacion_id FROM dataset.foto
                                WHERE especie_id = $1 AND observacion_id IS NOT NULL)`,
    [especieId]
  );
  // Solo subregiones de departamentos activos: donde se compila un paquete puede haber morfo.
  const { rows: subregiones } = await pool.query(
    `SELECT s.id, s.nombre, r.nombre AS region
     FROM dataset.subregion s JOIN dataset.region r ON r.codigo_dane = s.region
     WHERE r.estado = 'activa' ORDER BY r.nombre, s.numero`
  );
  return { morfos, observaciones, subregiones };
}

/** POST /api/dataset/especies/:id/morfos { subregion_id, nombre, nota? } */
async function declararMorfo(pool, especieId, body, userId) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const nota = typeof body.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 500) : null;
  const subregionId = Number(body.subregion_id);
  if (!nombre || nombre.length > 60) throw falla('Escribe el nombre del morfo (hasta 60 caracteres)');
  if (!Number.isInteger(subregionId)) throw falla('Elige la subregión del morfo');
  try {
    const { rows: [morfo] } = await pool.query(
      `INSERT INTO dataset.morfo (especie_id, subregion_id, nombre, nota, creado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, subregion_id, nombre, nota, creado`,
      [especieId, subregionId, nombre, nota, userId]
    );
    await registrar(pool, userId, 'dataset.morfo.declarado', 'morfo', morfo.id, { especie_id: Number(especieId), subregion_id: subregionId, nombre });
    return morfo;
  } catch (err) {
    if (err.code === '23505') throw falla('Ese morfo ya está declarado para esta especie en esa subregión', 409);
    if (err.code === '23503') throw falla('La especie o la subregión no existen', 404);
    throw err;
  }
}

/** DELETE /api/dataset/morfos/:id — los individuos etiquetados quedan sin morfo. */
async function quitarMorfo(pool, morfoId, userId) {
  const { rows: [morfo] } = await pool.query('DELETE FROM dataset.morfo WHERE id = $1 RETURNING id, especie_id, nombre', [morfoId]);
  if (!morfo) throw falla('Ese morfo no existe', 404);
  await registrar(pool, userId, 'dataset.morfo.quitado', 'morfo', morfo.id, { especie_id: morfo.especie_id, nombre: morfo.nombre });
  return morfo;
}

/**
 * PUT /api/dataset/observaciones/:id/etiqueta { estadio?, sustrato?, morfo_id? }. Solo cambia
 * los campos que vienen; null los borra. Cada campo exige su permiso.
 */
async function etiquetar(pool, observacionId, body, account, userId) {
  const cambios = {};
  for (const campo of Object.keys(PERMISO)) {
    if (!(campo in body)) continue;
    if (!puede(account, PERMISO[campo])) throw falla(`Falta el permiso "${PERMISO[campo]}"`, 403);
    cambios[campo] = body[campo] === '' ? null : body[campo];
  }
  if (!Object.keys(cambios).length) throw falla('No hay nada que cambiar');
  if (cambios.estadio != null && !ESTADIOS.includes(cambios.estadio)) throw falla('Estadio inválido');
  if (cambios.sustrato != null && !SUSTRATOS.includes(cambios.sustrato)) throw falla('Sustrato inválido');

  const { rows: [obs] } = await pool.query(
    `SELECT o.id, (SELECT especie_id FROM dataset.foto f WHERE f.observacion_id = o.id LIMIT 1) AS especie_id
     FROM dataset.observacion o WHERE o.id = $1`,
    [observacionId]
  );
  if (!obs) throw falla('Esa observación no existe', 404);
  if (cambios.morfo_id != null) {
    const { rows: [m] } = await pool.query('SELECT especie_id FROM dataset.morfo WHERE id = $1', [cambios.morfo_id]);
    if (!m) throw falla('Ese morfo no existe', 404);
    if (m.especie_id !== obs.especie_id) throw falla('Ese morfo es de otra especie');
  }

  const campos = Object.keys(cambios);
  const { rows: [fila] } = await pool.query(
    `INSERT INTO dataset.observacion_etiqueta (observacion_id, ${campos.join(', ')}, actualizado_por)
     VALUES ($1, ${campos.map((_, i) => `$${i + 2}`).join(', ')}, $${campos.length + 2})
     ON CONFLICT (observacion_id) DO UPDATE SET
       ${campos.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
       actualizado_por = EXCLUDED.actualizado_por, actualizado = NOW()
     RETURNING observacion_id, estadio, sustrato, morfo_id, actualizado`,
    [observacionId, ...campos.map((c) => cambios[c]), userId]
  );
  await registrar(pool, userId, 'dataset.observacion.etiqueta', 'observacion', observacionId, cambios);
  return fila;
}

module.exports = { deEspecie, declararMorfo, quitarMorfo, etiquetar, ESTADIOS, SUSTRATOS };
