/**
 * Limpieza del dataset: detecta vacíos y datos dudosos y PROPONE qué hacer; una persona
 * decide en Admin → Calidad (ver decidir()). Nunca sobrescribe latitud/longitud originales:
 * lo limpio va a latitud_limpia/longitud_limpia/uso_geografico.
 *
 * Coordenada aproximada = oculta por iNaturalist o con incertidumbre mayor al umbral.
 * iNaturalist desplaza las ocultas al azar dentro de su celda de 0,2°, así que la mediana de
 * los registros precisos de la misma especie en esa celda estima mejor el lugar. Con pocos
 * vecinos, la observación solo se usa a nivel de celda (como la altitud: mediana por zona,
 * no el punto exacto — ver 02 Metodología/Contexto del Paso a Paso).
 */
const { registrar } = require('./audit');

const falla = (mensaje) => Object.assign(new Error(mensaje), { status: 400 });

const DEFAULTS = {
  umbral_incertidumbre_m: 1000,
  celda_grados: 0.2,
  min_vecinos: 3,
  z_atipica: 3.5,
  distancia_min_atipica_km: 200,
  min_puntos_especie: 5,
};

const OPCIONES = {
  coordenada_aproximada: ['usar_mediana', 'solo_celda', 'excluir', 'corregir'],
  coordenada_atipica: ['mantener', 'excluir', 'corregir'],
  sin_coordenada: ['excluir', 'corregir'],
  derechos_reservados: ['solo_entrenamiento', 'excluir_del_entrenamiento'],
  sin_licencia: ['solo_entrenamiento', 'excluir_del_entrenamiento'],
};

const LICENCIA_EXPLICACION =
  'Decisión del autor (2026-09-13): el vector de una foto no es la obra, así que puede entrenar y viajar en el paquete; ' +
  'la foto nunca se muestra como evidencia en la ficha pública ni en el Explorador.';

function mediana(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function parametrosValidos(entrada = {}) {
  const p = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (entrada[k] === undefined) continue;
    const v = Number(entrada[k]);
    if (!Number.isFinite(v) || v <= 0) throw falla(`Parámetro inválido: ${k}`);
    p[k] = v;
  }
  return p;
}

async function ejecutarLimpieza(pool, entrada, userId) {
  const p = parametrosValidos(entrada);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rows: [{ id: corridaId }] } = await db.query(
      'INSERT INTO dataset.limpieza_corrida (parametros, iniciada_por) VALUES ($1, $2) RETURNING id', [p, userId]);

    const { rows: obs } = await db.query(`
      SELECT o.id, o.latitud, o.longitud, o.incertidumbre_m, o.coordenada_oculta,
             (SELECT especie_id FROM dataset.foto f WHERE f.observacion_id = o.id LIMIT 1) AS especie_id
      FROM dataset.observacion o
      WHERE o.invalidada_en IS NULL`);  // invalidada en Curación: ya no aporta ni como vecina
    const { rows: decididas } = await db.query(`
      SELECT DISTINCT observacion_id FROM dataset.hallazgo
      WHERE estado = 'decidido' AND observacion_id IS NOT NULL`);
    const yaDecidida = new Set(decididas.map((r) => String(r.observacion_id)));

    const esPrecisa = (o) => o.latitud !== null && !o.coordenada_oculta
      && (o.incertidumbre_m === null || o.incertidumbre_m <= p.umbral_incertidumbre_m);
    const celda = (lat, lon) => `${Math.floor(lat / p.celda_grados)}:${Math.floor(lon / p.celda_grados)}`;

    const precisasPorEspecie = new Map();
    const precisasPorCelda = new Map();
    for (const o of obs) {
      if (!esPrecisa(o) || o.especie_id === null) continue;
      if (!precisasPorEspecie.has(o.especie_id)) precisasPorEspecie.set(o.especie_id, []);
      precisasPorEspecie.get(o.especie_id).push(o);
      const k = `${o.especie_id}|${celda(o.latitud, o.longitud)}`;
      if (!precisasPorCelda.has(k)) precisasPorCelda.set(k, []);
      precisasPorCelda.get(k).push(o);
    }

    // Atípica = aislada: lejos de cualquier otro registro preciso de su especie. Una sola
    // mediana nacional marcaba poblaciones reales (Pacífico contra Amazonía); aquí la mediana
    // y la MAD son de la distancia al 2.º vecino más cercano de cada punto de la especie.
    const K = 2;
    const aislamiento = new Map();
    for (const [, puntos] of precisasPorEspecie) {
      if (puntos.length < p.min_puntos_especie) continue;
      const nn = puntos.map((a) => {
        const d = puntos.filter((b) => b !== a).map((b) => km(a.latitud, a.longitud, b.latitud, b.longitud)).sort((x, y) => x - y);
        return d[K - 1];
      });
      const mNN = mediana(nn);
      const mad = mediana(nn.map((x) => Math.abs(x - mNN)));
      puntos.forEach((o, i) => aislamiento.set(o.id, { nn: nn[i], mNN, mad, n: puntos.length }));
    }

    const hallazgos = [];
    const puntosAutomaticos = [];
    for (const o of obs) {
      if (o.latitud === null) {
        hallazgos.push({
          tipo: 'sin_coordenada', observacion_id: o.id, especie_id: o.especie_id,
          detalle: { motivo: 'iNaturalist no devolvió coordenada (observación borrada o privada)' },
          propuesta: { opcion: 'excluir', opciones: OPCIONES.sin_coordenada, metodo: 'sin_dato',
            explicacion: 'Sin coordenada no puede aportar a altitud ni a presencia; sigue sirviendo para entrenar.' },
        });
        continue;
      }
      if (esPrecisa(o)) {
        const e = aislamiento.get(o.id);
        if (e) {
          const z = e.mad > 0 ? (e.nn - e.mNN) / (1.4826 * e.mad) : 0;
          if (z > p.z_atipica && e.nn > p.distancia_min_atipica_km) {
            hallazgos.push({
              tipo: 'coordenada_atipica', observacion_id: o.id, especie_id: o.especie_id,
              detalle: { distancia_vecino_km: Math.round(e.nn), mediana_vecino_km: Math.round(e.mNN), z_robusto: Number(z.toFixed(1)),
                puntos_especie: e.n, original: { latitud: o.latitud, longitud: o.longitud } },
              propuesta: { opcion: 'excluir', opciones: OPCIONES.coordenada_atipica, metodo: 'mediana_mad_vecino_mas_cercano',
                explicacion: 'Puede ser un error de identificación o de coordenada, o una población real lejos del resto: ' +
                  'decídelo con la foto y el lugar.' },
            });
            continue;
          }
        }
        puntosAutomaticos.push(o.id);
        continue;
      }
      const redondo = (x) => Number(x.toFixed(6));
      const c0Lat = redondo(Math.floor(o.latitud / p.celda_grados) * p.celda_grados);
      const c0Lon = redondo(Math.floor(o.longitud / p.celda_grados) * p.celda_grados);
      const vecinos = precisasPorCelda.get(`${o.especie_id}|${celda(o.latitud, o.longitud)}`) || [];
      const conMediana = vecinos.length >= p.min_vecinos;
      const motivo = o.coordenada_oculta ? 'oculta_por_inaturalist' : 'incertidumbre_alta';
      hallazgos.push({
        tipo: 'coordenada_aproximada', observacion_id: o.id, especie_id: o.especie_id,
        detalle: { motivo, incertidumbre_m: o.incertidumbre_m, vecinos_precisos: vecinos.length,
          celda: { latitud: c0Lat, longitud: c0Lon, grados: p.celda_grados }, original: { latitud: o.latitud, longitud: o.longitud } },
        propuesta: conMediana
          ? { opcion: 'usar_mediana', opciones: OPCIONES.coordenada_aproximada, metodo: 'mediana_celda_misma_especie',
              latitud: mediana(vecinos.map((x) => x.latitud)), longitud: mediana(vecinos.map((x) => x.longitud)),
              explicacion: `Mediana de ${vecinos.length} registros precisos de la misma especie en la misma celda de ${String(p.celda_grados).replace('.', ',')}°.` }
          : { opcion: 'solo_celda', opciones: OPCIONES.coordenada_aproximada.filter((x) => x !== 'usar_mediana'), metodo: 'centro_celda',
              latitud: redondo(c0Lat + p.celda_grados / 2), longitud: redondo(c0Lon + p.celda_grados / 2),
              explicacion: `Menos de ${p.min_vecinos} registros precisos de la especie en su celda: solo aporta a nivel de celda ` +
                '(altitud por mediana de zona, presencia), no como punto.' },
      });
    }

    const { rows: fotos } = await db.query(`
      SELECT sha256, especie_id, licencia FROM dataset.foto f
      WHERE (licencia IS NULL OR licencia = 'all-rights-reserved')
        AND NOT EXISTS (SELECT 1 FROM dataset.exclusion x
                        WHERE x.sha256 = f.sha256 AND x.revertida IS NULL AND x.origen <> 'decision_licencia')`);
    for (const f of fotos) {
      const tipo = f.licencia === null ? 'sin_licencia' : 'derechos_reservados';
      hallazgos.push({
        tipo, sha256: f.sha256, especie_id: f.especie_id,
        detalle: { licencia: f.licencia },
        propuesta: { opcion: 'solo_entrenamiento', opciones: OPCIONES[tipo], metodo: 'decision_autor_2026_09_13', explicacion: LICENCIA_EXPLICACION },
      });
    }

    const porObs = hallazgos.filter((h) => h.observacion_id);
    const porFoto = hallazgos.filter((h) => h.sha256);
    const upsert = (conflicto, lista) => db.query(`
      INSERT INTO dataset.hallazgo (corrida_id, tipo, observacion_id, sha256, especie_id, detalle, propuesta)
      SELECT $1, x.tipo, x.observacion_id, x.sha256, x.especie_id, x.detalle, x.propuesta
      FROM jsonb_to_recordset($2::jsonb)
        AS x(tipo text, observacion_id bigint, sha256 char(64), especie_id int, detalle jsonb, propuesta jsonb)
      ON CONFLICT ${conflicto} DO UPDATE SET
        corrida_id = EXCLUDED.corrida_id, detalle = EXCLUDED.detalle, propuesta = EXCLUDED.propuesta, actualizado = NOW()
      WHERE dataset.hallazgo.estado = 'pendiente'`, [corridaId, JSON.stringify(lista)]);
    await upsert('(tipo, observacion_id) WHERE observacion_id IS NOT NULL', porObs);
    await upsert('(tipo, sha256) WHERE sha256 IS NOT NULL', porFoto);
    // Lo que ya no es un problema en esta corrida y nadie había decidido, se retira.
    await db.query("DELETE FROM dataset.hallazgo WHERE estado = 'pendiente' AND corrida_id <> $1", [corridaId]);

    const automaticas = puntosAutomaticos.filter((id) => !yaDecidida.has(String(id)));
    await db.query(`
      UPDATE dataset.observacion SET latitud_limpia = latitud, longitud_limpia = longitud,
        uso_geografico = 'punto', limpieza_metodo = 'precisa'
      WHERE id = ANY($1::bigint[])`, [automaticas]);
    // Pendiente de decisión = no entra a ninguna capa geográfica todavía.
    await db.query(`
      UPDATE dataset.observacion o SET latitud_limpia = NULL, longitud_limpia = NULL,
        uso_geografico = NULL, limpieza_metodo = 'pendiente_de_decision'
      FROM dataset.hallazgo h
      WHERE h.observacion_id = o.id AND h.estado = 'pendiente'`);

    const resumen = {
      observaciones: obs.length,
      precisas_automaticas: automaticas.length,
      por_tipo: hallazgos.reduce((acc, h) => ({ ...acc, [h.tipo]: (acc[h.tipo] || 0) + 1 }), {}),
      aproximadas_con_mediana: porObs.filter((h) => h.propuesta.opcion === 'usar_mediana').length,
    };
    await db.query('UPDATE dataset.limpieza_corrida SET resumen = $2 WHERE id = $1', [corridaId, resumen]);
    await db.query('COMMIT');
    return { corrida: corridaId, parametros: p, resumen };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

function validarCoordenada(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
    throw falla('Coordenada inválida');
  }
  return [la, lo];
}

/**
 * Decide uno o varios hallazgos. `opcion: 'propuesta'` aplica a cada uno su propia propuesta
 * (para aceptar en lote). `corregir` exige un solo hallazgo y la coordenada escrita a mano.
 */
async function decidir(pool, { ids, filtro, opcion, latitud, longitud, motivo }, userId) {
  if (!opcion) throw falla('Falta la opción');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    let rows;
    if (Array.isArray(ids) && ids.length) {
      ({ rows } = await db.query(
        "SELECT * FROM dataset.hallazgo WHERE id = ANY($1::bigint[]) AND estado = 'pendiente' FOR UPDATE", [ids]));
    } else if (filtro && filtro.tipo) {
      ({ rows } = await db.query(
        `SELECT * FROM dataset.hallazgo WHERE estado = 'pendiente' AND tipo = $1
           AND ($2::int IS NULL OR especie_id = $2) FOR UPDATE`, [filtro.tipo, filtro.especie_id ?? null]));
    } else {
      throw falla('Indica qué hallazgos decidir');
    }
    if (!rows.length) throw falla('No hay hallazgos pendientes con ese criterio');
    if (opcion === 'corregir' && rows.length !== 1) throw falla('Corregir a mano se hace de a un hallazgo');
    const manual = opcion === 'corregir' ? validarCoordenada(latitud, longitud) : null;

    for (const h of rows) {
      const elegida = opcion === 'propuesta' ? h.propuesta.opcion : opcion;
      if (!h.propuesta.opciones.includes(elegida)) {
        throw falla(`"${elegida}" no es una opción para ${h.tipo}`);
      }
      if (h.observacion_id) {
        const set = {
          usar_mediana: [h.propuesta.latitud, h.propuesta.longitud, 'punto', h.propuesta.metodo],
          solo_celda: [h.propuesta.latitud, h.propuesta.longitud, 'celda', 'centro_celda'],
          mantener: [null, null, 'punto', 'mantenida_por_decision'],
          excluir: [null, null, 'excluida', 'excluida_por_decision'],
          corregir: [manual?.[0], manual?.[1], 'punto', 'corregida_a_mano'],
        }[elegida];
        if (elegida === 'mantener') {
          await db.query(`UPDATE dataset.observacion SET latitud_limpia = latitud, longitud_limpia = longitud,
            uso_geografico = $2, limpieza_metodo = $3 WHERE id = $1`, [h.observacion_id, set[2], set[3]]);
        } else {
          await db.query(`UPDATE dataset.observacion SET latitud_limpia = $2, longitud_limpia = $3,
            uso_geografico = $4, limpieza_metodo = $5 WHERE id = $1`, [h.observacion_id, ...set]);
        }
      } else if (elegida === 'excluir_del_entrenamiento') {
        await db.query(`INSERT INTO dataset.exclusion (sha256, motivo, por, origen) VALUES ($1, $2, $3, 'decision_licencia')`,
          [h.sha256, `${h.tipo === 'sin_licencia' ? 'sin licencia' : 'todos los derechos reservados'}${motivo ? `: ${motivo}` : ''}`, userId]);
      }
      await db.query(`UPDATE dataset.hallazgo SET estado = 'decidido', decision = $2, motivo = $3,
        decidido_por = $4, decidido_en = NOW(), actualizado = NOW() WHERE id = $1`,
        [h.id, { opcion: elegida, ...(manual ? { latitud: manual[0], longitud: manual[1] } : {}) }, motivo || null, userId]);
    }

    const tipos = [...new Set(rows.map((r) => r.tipo))];
    await registrar(db, userId, 'dataset.hallazgo.decision', 'hallazgo',
      rows.length === 1 ? rows[0].id : `${rows.length} hallazgos`, { opcion, tipos, n: rows.length, motivo: motivo || null });
    await db.query('COMMIT');
    return { decididos: rows.length };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

module.exports = { DEFAULTS, OPCIONES, ejecutarLimpieza, decidir };
