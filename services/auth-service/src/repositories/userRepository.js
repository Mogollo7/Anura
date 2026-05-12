const pool = require('../config/database');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');

exports.findByEmail = async (email) => {
  const query = 'SELECT * FROM auth.users WHERE email = $1';
  const result = await pool.query(query, [email]);
  return result.rows[0] ? new User(result.rows[0]) : null;
};

exports.findByUsername = async (username) => {
  const query = 'SELECT * FROM auth.users WHERE username = $1';
  const result = await pool.query(query, [username]);
  return result.rows[0] ? new User(result.rows[0]) : null;
};

exports.findByGoogleId = async (googleId) => {
  const query = 'SELECT * FROM auth.users WHERE google_id = $1';
  const result = await pool.query(query, [googleId]);
  return result.rows[0] ? new User(result.rows[0]) : null;
};

exports.createUser = async (userData) => {
  const query = `
    INSERT INTO auth.users (username, email, password_hash, auth_provider, google_id, profile_image, role) 
    VALUES ($1, $2, $3, $4, $5, $6, $7) 
    RETURNING *
  `;
  const values = [
    userData.username, 
    userData.email, 
    userData.password_hash || null, 
    userData.auth_provider || 'email',
    userData.google_id || null,
    userData.profile_image || null,
    userData.role || 'user'
  ];
  
  const result = await pool.query(query, values);
  return new User(result.rows[0]);
};

exports.createResetCode = async (userId, code) => {
  // Expira en 15 minutos
  const expiresAt = new Date(Date.now() + 15 * 60000);
  const query = 'INSERT INTO auth.password_reset_codes (user_id, code, expires_at) VALUES ($1, $2, $3)';
  await pool.query(query, [userId, code, expiresAt]);
};

exports.verifyResetCode = async (email, code) => {
  const query = `
    SELECT prc.* 
    FROM auth.password_reset_codes prc
    JOIN auth.users u ON u.id = prc.user_id
    WHERE u.email = $1 AND prc.code = $2 AND prc.used = FALSE AND prc.expires_at > NOW()
  `;
  const result = await pool.query(query, [email, code]);
  return result.rows[0] ? new PasswordReset(result.rows[0]) : null;
};

exports.markResetCodeAsUsed = async (id) => {
  const query = 'UPDATE auth.password_reset_codes SET used = TRUE WHERE id = $1';
  await pool.query(query, [id]);
};

exports.updatePassword = async (userId, passwordHash) => {
  const query = 'UPDATE auth.users SET password_hash = $1 WHERE id = $2';
  await pool.query(query, [passwordHash, userId]);
};
