const pool = require('../config/database');
const PanelAccount = require('../models/PanelAccount');

exports.findByEmail = async (email) => {
  const result = await pool.query(
    'SELECT * FROM auth.panel_accounts WHERE lower(email) = lower($1)',
    [email]
  );
  return result.rows[0] ? new PanelAccount(result.rows[0]) : null;
};

exports.findById = async (id) => {
  const result = await pool.query('SELECT * FROM auth.panel_accounts WHERE id = $1', [id]);
  return result.rows[0] ? new PanelAccount(result.rows[0]) : null;
};

exports.list = async () => {
  const result = await pool.query('SELECT * FROM auth.panel_accounts ORDER BY created_at ASC');
  return result.rows.map((row) => new PanelAccount(row));
};

/** Primer login real de esa cuenta: ata el user_id de auth.users, ya no cambia después. */
exports.linkUserId = async (panelAccountId, userId) => {
  await pool.query('UPDATE auth.panel_accounts SET user_id = $1 WHERE id = $2 AND user_id IS NULL', [
    userId,
    panelAccountId,
  ]);
};

exports.create = async ({ name, email, permissions, createdBy }) => {
  const result = await pool.query(
    `INSERT INTO auth.panel_accounts (name, email, is_super, permissions, created_by)
     VALUES ($1, $2, FALSE, $3, $4)
     RETURNING *`,
    [name, email, JSON.stringify(permissions), createdBy || null]
  );
  return new PanelAccount(result.rows[0]);
};

exports.updatePermission = async (id, action, value) => {
  const result = await pool.query(
    `UPDATE auth.panel_accounts
     SET permissions = jsonb_set(permissions, ARRAY[$2], to_jsonb($3::boolean)), updated_at = NOW()
     WHERE id = $1 AND is_super = FALSE
     RETURNING *`,
    [id, action, value]
  );
  return result.rows[0] ? new PanelAccount(result.rows[0]) : null;
};

exports.remove = async (id) => {
  const result = await pool.query(
    'DELETE FROM auth.panel_accounts WHERE id = $1 AND is_super = FALSE RETURNING *',
    [id]
  );
  return result.rows[0] ? new PanelAccount(result.rows[0]) : null;
};
