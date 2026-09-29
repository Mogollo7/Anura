const express = require('express');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

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
// Un envío = una fila por destinatario con el mismo metadata.envio.

app.get('/api/notifications/panel/avisos', requirePanel('gestionarCuentas'), async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT n.metadata->>'envio' AS id, MIN(n.title) AS titulo, MIN(n.body) AS cuerpo,
             MIN(n.metadata->>'destino') AS destino, MIN(n.metadata->>'autor') AS autor,
             MIN(n.created_at) AS enviado, COUNT(*)::int AS destinatarios,
             COUNT(*) FILTER (WHERE n.is_read)::int AS leidos,
             CASE WHEN COUNT(*) = 1 THEN MIN(u.username) END AS usuario
      FROM notifications.notifications n
      LEFT JOIN auth.users u ON u.id = n.user_id
      WHERE n.type = 'aviso' AND n.metadata ? 'envio'
      GROUP BY n.metadata->>'envio'
      ORDER BY MIN(n.created_at) DESC
      LIMIT 200
    `);
    res.json({ avisos: rows });
  } catch (err) {
    console.error('[avisos] listar:', err.message);
    res.status(500).json({ message: 'No se pudieron leer los avisos' });
  }
});

// POST { titulo, cuerpo, destino: 'todos' | 'usuario', usuario_id? }
app.post('/api/notifications/panel/avisos', requirePanel('gestionarCuentas'), async (req, res) => {
  const titulo = typeof req.body.titulo === 'string' ? req.body.titulo.trim() : '';
  const cuerpo = typeof req.body.cuerpo === 'string' ? req.body.cuerpo.trim() : '';
  const { destino, usuario_id: usuarioId } = req.body;
  if (!titulo || titulo.length > 80) return res.status(400).json({ message: 'El título va de 1 a 80 caracteres' });
  if (cuerpo.length > 500) return res.status(400).json({ message: 'El mensaje va hasta 500 caracteres' });
  if (destino !== 'todos' && destino !== 'usuario') return res.status(400).json({ message: 'Elige a quién va el aviso' });
  if (destino === 'usuario' && !usuarioId) return res.status(400).json({ message: 'Elige el usuario' });

  const envio = randomUUID();
  const metadata = { envio, destino, autor: req.panelAccount.name };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `INSERT INTO notifications.notifications (user_id, type, title, body, metadata)
       SELECT u.id, 'aviso', $1, NULLIF($2, ''), $3
       FROM auth.users u
       WHERE u.is_active AND ($4::text = 'todos' OR u.id::text = $5::text)`,
      [titulo, cuerpo, JSON.stringify(metadata), destino, usuarioId || null]
    );
    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'No hay cuentas activas para ese destino' });
    }
    await client.query(
      `INSERT INTO audit.log (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, 'aviso.send', 'aviso', $2, $3)`,
      [req.panelAccount.userId || null, envio, JSON.stringify({ titulo, destino, destinatarios: rowCount })]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: envio, destinatarios: rowCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[avisos] enviar:', err.message);
    res.status(err.code === '22P02' ? 400 : 500).json({ message: 'No se pudo enviar el aviso' });
  } finally {
    client.release();
  }
});

// ── App y web: los avisos de quien inició sesión ─────────────────────────────

app.get('/api/notifications', requireUser, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, title, body, is_read, created_at FROM notifications.notifications
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.userId]
    );
    res.json({ avisos: rows, sin_leer: rows.filter((r) => !r.is_read).length });
  } catch (err) {
    console.error('[avisos] propios:', err.message);
    res.status(500).json({ message: 'No se pudieron leer tus avisos' });
  }
});

app.post('/api/notifications/:id/leido', requireUser, async (req, res) => {
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

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => console.log(`notification-service running on :${PORT}`));
