const pool = require('../config/database');
const UserPreferences = require('../models/UserPreferences');

exports.findByUserId = async (userId) => {
  const query = 'SELECT * FROM auth.user_preferences WHERE user_id = $1';
  const result = await pool.query(query, [userId]);
  return result.rows[0] ? new UserPreferences(result.rows[0]) : null;
};

exports.create = async (userId, preferencesData) => {
  const query = `
    INSERT INTO auth.user_preferences 
      (user_id, theme, interface_mode, accessibility_mode, language, 
       notifications_enabled, email_notifications, push_notifications, 
       exact_location_enabled, public_profile, preferences_completed) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
    RETURNING *
  `;
  const values = [
    userId,
    preferencesData.theme || 'dark',
    preferencesData.interface_mode || 'standard',
    preferencesData.accessibility_mode ?? false,
    preferencesData.language || 'es',
    preferencesData.notifications_enabled ?? true,
    preferencesData.email_notifications ?? true,
    preferencesData.push_notifications ?? true,
    preferencesData.exact_location_enabled ?? false,
    preferencesData.public_profile ?? true,
    preferencesData.preferences_completed ?? false
  ];
  const result = await pool.query(query, values);
  return new UserPreferences(result.rows[0]);
};

exports.update = async (userId, preferencesData) => {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (preferencesData.theme !== undefined) {
    fields.push(`theme = $${paramIndex++}`);
    values.push(preferencesData.theme);
  }
  if (preferencesData.interface_mode !== undefined) {
    fields.push(`interface_mode = $${paramIndex++}`);
    values.push(preferencesData.interface_mode);
  }
  if (preferencesData.accessibility_mode !== undefined) {
    fields.push(`accessibility_mode = $${paramIndex++}`);
    values.push(preferencesData.accessibility_mode);
  }
  if (preferencesData.language !== undefined) {
    fields.push(`language = $${paramIndex++}`);
    values.push(preferencesData.language);
  }
  if (preferencesData.notifications_enabled !== undefined) {
    fields.push(`notifications_enabled = $${paramIndex++}`);
    values.push(preferencesData.notifications_enabled);
  }
  if (preferencesData.email_notifications !== undefined) {
    fields.push(`email_notifications = $${paramIndex++}`);
    values.push(preferencesData.email_notifications);
  }
  if (preferencesData.push_notifications !== undefined) {
    fields.push(`push_notifications = $${paramIndex++}`);
    values.push(preferencesData.push_notifications);
  }
  if (preferencesData.exact_location_enabled !== undefined) {
    fields.push(`exact_location_enabled = $${paramIndex++}`);
    values.push(preferencesData.exact_location_enabled);
  }
  if (preferencesData.public_profile !== undefined) {
    fields.push(`public_profile = $${paramIndex++}`);
    values.push(preferencesData.public_profile);
  }
  if (preferencesData.preferences_completed !== undefined) {
    fields.push(`preferences_completed = $${paramIndex++}`);
    values.push(preferencesData.preferences_completed);
  }

  if (fields.length === 0) {
    return exports.findByUserId(userId);
  }

  values.push(userId);
  const query = `
    UPDATE auth.user_preferences 
    SET ${fields.join(', ')} 
    WHERE user_id = $${paramIndex} 
    RETURNING *
  `;
  
  const result = await pool.query(query, values);
  return result.rows[0] ? new UserPreferences(result.rows[0]) : null;
};

exports.upsert = async (userId, preferencesData) => {
  const existing = await exports.findByUserId(userId);
  if (existing) {
    return exports.update(userId, preferencesData);
  }
  return exports.create(userId, preferencesData);
};