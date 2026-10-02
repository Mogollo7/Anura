const express = require('express');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const aviso = require('./aviso');

const app = express();
// Cuerpos chicos por defecto; solo el envío con imagen admite hasta 3 MB, y solo después de comprobar la cuenta.
const jsonChico = express.json({ limit: '20kb' });
const jsonRico = express.json({ limit: '3mb' });
app.disable('x-powered-by');
// PUBLIC_BASE_URL: de dónde cuelga /a/<token> (lo que ve la persona en el teléfono).
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://anura.juanlabs.me').replace(/\/+$/, '');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notification-service' }));

// Quién llama lo decide auth-service (dueño de cuentas y sesiones): se reenvía el mismo token.
async function askAuth(path, req) {
  const r = await fetch(`${AUTH_SERVICE_URL}${path}`, {
    headers: { Authorization: req.headers.authorization },
    signal: AbortSignal.timeout(5000),
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}

const requireUser = async (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).json({ message: 'Inicia sesión' });
  try {
    const r = await askAuth('/api/auth/me', req);
    if (!r.ok || !r.body.user?.id) return res.status(401).json({ message: 'La sesión ya no es válida' });
    req.userId = r.body.user.id;
    next();
  } catch {
    res.status(502).json({ message: 'auth-service no responde' });
  }
};

const requirePanel = (action) => async (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).json({ message: 'Inicia sesión en el panel' });
  try {
    const r = await askAuth('/api/panel/me', req);
    if (!r.ok) return res.status(r.status).json({ message: r.body.message || 'Sin acceso al panel' });
    const account = r.body.account;
    if (!account.isSuperAdmin && !account.permissions?.[action]) {
      return res.status(403).json({ message: `Falta el permiso "${action}"` });
    }
    req.panelAccount = account;
    next();
  } catch {
    res.status(502).json({ message: 'auth-service no responde' });
  }
};

// ── Panel (Admin → Operación → Notificaciones) ───────────────────────────────
// Un envío = una fila por destinatario con el mismo metadata.envio. Si trae más que texto corto
// (texto largo, enlaces, imagen), el contenido completo vive una sola vez en avisos_envios y el
// teléfono recibe un resumen con el enlace público /a/<token>.

// Antirrebote y tope por cuenta (memoria del proceso: suficiente para un solo servicio).
const ENVIOS_RECIENTES = new Map(); // cuenta -> [{ t, huella }]
const VENTANA_MS = 10 * 60 * 1000;
const MAX_ENVIOS_VENTANA = 10;
const DUPLICADO_MS = 60 * 1000;
function antirrebote(cuenta, huella) {
  const ahora = Date.now();
  const lista = (ENVIOS_RECIENTES.get(cuenta) || []).filter((e) => ahora - e.t < VENTANA_MS);
  ENVIOS_RECIENTES.set(cuenta, lista);
  if (lista.some((e) => e.huella === huella && ahora - e.t < DUPLICADO_MS)) {
    return 'Ya enviaste este mismo aviso hace un momento. Si de verdad quieres repetirlo, espera un minuto.';
  }
  if (lista.length >= MAX_ENVIOS_VENTANA) return `Hiciste ${MAX_ENVIOS_VENTANA} envíos en 10 minutos. Espera un poco antes de mandar otro.`;
  return null;
}
const registrarEnvio = (cuenta, huella) => ENVIOS_RECIENTES.get(cuenta).push({ t: Date.now(), huella });

app.get('/api/notifications/panel/avisos', requirePanel('gestionarCuentas'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT n.metadata->>'envio' AS id, MIN(n.title) AS titulo, MIN(n.body) AS cuerpo,
             MIN(n.metadata->>'destino') AS destino, MIN(n.metadata->>'autor') AS autor,
             MIN(n.created_at) AS enviado, COUNT(*)::int AS destinatarios,
             COUNT(*) FILTER (WHERE n.is_read)::int AS leidos,
             CASE WHEN COUNT(*) = 1 THEN MIN(u.username) END AS usuario,
             MIN(e.token) AS token,
             COALESCE(MAX(jsonb_array_length(e.enlaces)), 0)::int AS enlaces,
             BOOL_OR(e.imagen_id IS NOT NULL OR e.imagen_url IS NOT NULL) AS con_imagen
      FROM notifications.notifications n
      LEFT JOIN auth.users u ON u.id = n.user_id
      LEFT JOIN notifications.avisos_envios e ON e.id::text = n.metadata->>'envio'
      WHERE n.type = 'aviso' AND n.metadata ? 'envio'
      GROUP BY n.metadata->>'envio'
      ORDER BY MIN(n.created_at) DESC
      LIMIT 200
    `);
    res.json({
      avisos: rows.map(({ token, ...r }) => ({ ...r, enlace_publico: token ? `${PUBLIC_BASE_URL}/a/${token}` : null, con_imagen: !!r.con_imagen })),
    });
  } catch (err) {
    console.error('[avisos] listar:', err.message);
    res.status(500).json({ message: 'No se pudieron leer los avisos' });
  }
});

// Contenido completo de un envío (para verlo en el panel).
app.get('/api/notifications/panel/avisos/:id', requirePanel('gestionarCuentas'), async (req, res) => {
  try {
    const { rows: [e] } = await pool.query(
      `SELECT id, token, titulo, cuerpo, enlaces, imagen_id, imagen_url, destino, autor, created_at
       FROM notifications.avisos_envios WHERE id::text = $1`, [req.params.id]);
    if (!e) return res.status(404).json({ message: 'Ese aviso no tiene contenido enriquecido (es de texto corto).' });
    res.json({ ...e, token: undefined, enlace_publico: `${PUBLIC_BASE_URL}/a/${e.token}`, imagen: e.imagen_id ? `${PUBLIC_BASE_URL}/a/${e.token}/imagen` : e.imagen_url });
  } catch (err) {
    res.status(err.code === '22P02' ? 404 : 500).json({ message: 'No se pudo leer el aviso' });
  }
});

const FILTRO_DESTINO = `u.is_active AND ($1::text = 'todos' OR ($1::text IN ('usuario', 'usuarios') AND u.id::text = ANY($2::text[])))`;

// POST { titulo, cuerpo?, destino: 'todos'|'usuario'|'usuarios', usuario_id?, usuario_ids?,
//        enlaces?: [{texto,url}], imagen?: {base64}, imagen_url?, vista_previa? }
// Con vista_previa: true valida y devuelve lo que se enviaría, sin escribir nada.
app.post('/api/notifications/panel/avisos', requirePanel('gestionarCuentas'), jsonRico, async (req, res) => {
  let envio;
  try {
    envio = aviso.validarEnvio(req.body);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message });
  }

  const idEnvio = randomUUID();
  const token = aviso.nuevoToken();
  const url = `${PUBLIC_BASE_URL}/a/${token}`;
  const cuerpoApp = aviso.cuerpoTelefono(envio, url);
  const rico = aviso.esRico(envio);

  if (envio.dryRun) {
    try {
      const { rows: [{ n }] } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM auth.users u WHERE ${FILTRO_DESTINO}`, [envio.destino, envio.usuarioIds]);
      return res.json({
        vista_previa: true, destinatarios: n, titulo: envio.titulo, cuerpo_telefono: cuerpoApp,
        largo: cuerpoApp.length, rico, enlace_publico: rico ? `${PUBLIC_BASE_URL}/a/…` : null,
      });
    } catch (err) {
      console.error('[avisos] vista previa:', err.message);
      return res.status(err.code === '22P02' ? 400 : 500).json({ message: 'No se pudo calcular la vista previa' });
    }
  }

  const cuenta = String(req.panelAccount.id ?? req.panelAccount.userId ?? req.panelAccount.name);
  const huella = JSON.stringify([envio.titulo, envio.cuerpo, envio.destino, envio.usuarioIds, envio.enlaces, envio.imagen?.sha256 ?? envio.imagenUrl ?? null]);
  const rebote = antirrebote(cuenta, huella);
  if (rebote) return res.status(429).json({ message: rebote });

  const metadata = { envio: idEnvio, destino: envio.destino, autor: req.panelAccount.name, ...(rico ? { token, rico: true } : {}) };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let imagenId = null;
    if (envio.imagen) {
      // La misma imagen reenviada no se guarda dos veces.
      const { rows: [m] } = await client.query(
        `INSERT INTO notifications.avisos_media (mime, bytes, size_bytes, sha256) VALUES ($1, $2, $3, $4)
         ON CONFLICT (sha256) DO UPDATE SET mime = EXCLUDED.mime RETURNING id`,
        [envio.imagen.mime, envio.imagen.bytes, envio.imagen.bytes.length, envio.imagen.sha256]);
      imagenId = m.id;
    }
    if (rico) {
      await client.query(
        `INSERT INTO notifications.avisos_envios (id, token, titulo, cuerpo, enlaces, imagen_id, imagen_url, destino, autor)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [idEnvio, token, envio.titulo, envio.cuerpo, JSON.stringify(envio.enlaces), imagenId, envio.imagenUrl, envio.destino, req.panelAccount.name || null]);
    }
    const { rowCount } = await client.query(
      `INSERT INTO notifications.notifications (user_id, type, title, body, metadata)
       SELECT u.id, 'aviso', $3, NULLIF($4, ''), $5
       FROM auth.users u
       WHERE ${FILTRO_DESTINO}`,
      [envio.destino, envio.usuarioIds, envio.titulo, cuerpoApp, JSON.stringify(metadata)]);
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No hay cuentas activas para ese destino' });
    }
    await client.query(
      `INSERT INTO audit.log (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, 'aviso.send', 'aviso', $2, $3)`,
      [req.panelAccount.userId || null, idEnvio, JSON.stringify({
        titulo: envio.titulo, destino: envio.destino, destinatarios: rowCount,
        enlaces: envio.enlaces.length, imagen: !!(envio.imagen || envio.imagenUrl), rico,
      })]
    );
    await client.query('COMMIT');
    registrarEnvio(cuenta, huella);
    res.status(201).json({ id: idEnvio, destinatarios: rowCount, enlace_publico: rico ? url : null });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[avisos] enviar:', err.message);
    res.status(err.code === '22P02' ? 400 : 500).json({ message: 'No se pudo enviar el aviso' });
  } finally {
    client.release();
  }
});

// Retirar un aviso enviado por error: desaparece de la web y de la app de todos los destinatarios.
app.delete('/api/notifications/panel/avisos/:id', requirePanel('gestionarCuentas'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      "DELETE FROM notifications.notifications WHERE type = 'aviso' AND metadata->>'envio' = $1", [req.params.id]);
    if (!rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No existe ese aviso' });
    }
    const { rows: [e] } = await client.query(
      'DELETE FROM notifications.avisos_envios WHERE id::text = $1 RETURNING imagen_id', [req.params.id]);
    if (e?.imagen_id) {
      await client.query(
        `DELETE FROM notifications.avisos_media m WHERE m.id = $1
         AND NOT EXISTS (SELECT 1 FROM notifications.avisos_envios x WHERE x.imagen_id = m.id)`, [e.imagen_id]);
    }
    await client.query(
      `INSERT INTO audit.log (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, 'aviso.retirado', 'aviso', $2, $3)`,
      [req.panelAccount.userId || null, req.params.id, JSON.stringify({ filas: rowCount })]);
    await client.query('COMMIT');
    res.json({ retirados: rowCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[avisos] retirar:', err.message);
    res.status(err.code === '22P02' ? 404 : 500).json({ message: 'No se pudo retirar el aviso' });
  } finally {
    client.release();
  }
});

// ── Público: el aviso completo, como un correo (sin sesión; el token no se puede adivinar) ──────

const VISITAS = new Map(); // ip -> { n, hasta }
function limitePublico(req, res, next) {
  const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  const ahora = Date.now();
  const v = VISITAS.get(ip);
  if (!v || v.hasta < ahora) VISITAS.set(ip, { n: 1, hasta: ahora + 60_000 });
  else if (++v.n > 120) return res.status(429).type('text').send('Demasiadas visitas. Espera un minuto.');
  if (VISITAS.size > 5000) for (const [k, x] of VISITAS) if (x.hasta < ahora) VISITAS.delete(k);
  next();
}

const TOKEN_OK = /^[A-Za-z0-9_-]{16,64}$/;
async function envioPorToken(token) {
  if (!TOKEN_OK.test(token)) return null;
  const { rows: [e] } = await pool.query(
    `SELECT id, token, titulo, cuerpo, enlaces, imagen_id, imagen_url, autor, created_at
     FROM notifications.avisos_envios WHERE token = $1`, [token]);
  return e || null;
}

app.get('/ver/:token', limitePublico, async (req, res) => {
  try {
    const e = await envioPorToken(req.params.token);
    if (!e) return res.status(404).type('text').send('Este aviso no existe o fue retirado.');
    const imagen = e.imagen_id ? `/a/${e.token}/imagen` : e.imagen_url;
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    res.send(aviso.paginaAviso(e, imagen));
  } catch (err) {
    console.error('[avisos] página:', err.message);
    res.status(500).type('text').send('No se pudo cargar el aviso.');
  }
});

app.get('/ver/:token/imagen', limitePublico, async (req, res) => {
  try {
    const e = await envioPorToken(req.params.token);
    if (!e?.imagen_id) return res.status(404).end();
    const { rows: [m] } = await pool.query('SELECT mime, bytes FROM notifications.avisos_media WHERE id = $1', [e.imagen_id]);
    if (!m) return res.status(404).end();
    res.set({
      'Content-Type': m.mime, 'Content-Length': m.bytes.length, 'Cache-Control': 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.send(m.bytes);
  } catch (err) {
    console.error('[avisos] imagen:', err.message);
    res.status(500).end();
  }
});

// Mismo contenido en JSON (para que la web pueda mostrarlo sin abrir otra página).
app.get('/api/notifications/public/:token', limitePublico, async (req, res) => {
  try {
    const e = await envioPorToken(req.params.token);
    if (!e) return res.status(404).json({ message: 'Este aviso no existe o fue retirado.' });
    res.json({
      titulo: e.titulo, cuerpo: e.cuerpo, enlaces: e.enlaces, autor: e.autor, enviado: e.created_at,
      imagen: e.imagen_id ? `/a/${e.token}/imagen` : e.imagen_url,
    });
  } catch {
    res.status(500).json({ message: 'No se pudo cargar el aviso' });
  }
});

// ── App y web: los avisos de quien inició sesión ─────────────────────────────

app.get('/api/notifications', requireUser, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, title, body, is_read, created_at,
              CASE WHEN metadata ? 'token'
                THEN $2 || '/a/' || (metadata->>'token')
                ELSE NULL END AS enlace
       FROM notifications.notifications
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.userId, PUBLIC_BASE_URL]
    );
    res.json({ avisos: rows, sin_leer: rows.filter((r) => !r.is_read).length });
  } catch (err) {
    console.error('[avisos] propios:', err.message);
    res.status(500).json({ message: 'No se pudieron leer tus avisos' });
  }
});

app.post('/api/notifications/:id/leido', jsonChico, requireUser, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE notifications.notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ message: 'No existe ese aviso' });
    res.status(204).send();
  } catch (err) {
    res.status(err.code === '22P02' ? 404 : 500).json({ message: 'No se pudo marcar como leído' });
  }
});

app.delete('/api/notifications/:id', requireUser, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM notifications.notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ message: 'No existe ese aviso' });
    res.status(204).send();
  } catch (err) {
    res.status(err.code === '22P02' ? 404 : 500).json({ message: 'No se pudo eliminar el aviso' });
  }
});

// Cuerpos inválidos o demasiado grandes: JSON con el motivo, no la página de error de Express.
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ message: 'El aviso pesa demasiado (la imagen puede ir hasta 2 MB).' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'El aviso no llegó bien formado.' });
  console.error('[avisos] error no controlado:', err?.message);
  res.status(500).json({ message: 'Error inesperado' });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => console.log(`notification-service running on :${PORT}`));
