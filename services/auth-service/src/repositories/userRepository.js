const pool = require('../config/database');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

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

exports.findById = async (id) => {
  const query = 'SELECT * FROM auth.users WHERE id = $1';
  const result = await pool.query(query, [id]);
  return result.rows[0] ? new User(result.rows[0]) : null;
};

exports.createUser = async (userData) => {
  // OAuth users may not have a password — generate a random one to satisfy NOT NULL
  let passwordHash = userData.password_hash;
  if (!passwordHash) {
    const randomPassword = Math.random().toString(36).slice(-10) + Date.now();
    passwordHash = bcrypt.hashSync(randomPassword, 10);
  }

  const query = `
    INSERT INTO auth.users
      (username, email, password_hash, auth_provider, google_id, profile_image, role)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;
  const values = [
    userData.username,
    userData.email,
    passwordHash,
    userData.auth_provider || 'email',
    userData.google_id  || null,
    userData.profile_image || null,
    userData.role || 'user',
  ];

  const result = await pool.query(query, values);
  return new User(result.rows[0]);
};

exports.updatePassword = async (userId, passwordHash) => {
  const query = 'UPDATE auth.users SET password_hash = $1, updated_at = NOW() WHERE id = $2';
  await pool.query(query, [passwordHash, userId]);
};

exports.updateProfile = async (userId, fields) => {
  const allowed = ['username', 'biography', 'profile_image', 'profile_image_blob'];
  const updates = [];
  const values  = [];
  let idx = 1;

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = $${idx++}`);
      values.push(fields[key]);
    }
  }
  if (updates.length === 0) return exports.findById(userId);

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const query = `UPDATE auth.users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows[0] ? new User(result.rows[0]) : null;
};
