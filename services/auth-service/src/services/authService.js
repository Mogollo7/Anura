const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const preferencesRepository = require('../repositories/preferencesRepository');
const config = require('../core/config');

const createToken = (user, rememberMe = false) => {
  const expiresIn = rememberMe ? '30d' : '1d';
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret || process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn }
  );
};

exports.registrar = async (data) => {
  let { username, email, password, role } = data;

  if (!email || !password) {
    throw new Error('Debe enviar email y password');
  }

  // Generar username creativo si no se proporciona
  if (!username) {
    username = email.split('@')[0] + '_' + Math.floor(Math.random() * 10000);
  }

  const existingUserByEmail = await userRepository.findByEmail(email);
  if (existingUserByEmail) {
    throw new Error('El email ya está registrado');
  }

  const existingUserByUsername = await userRepository.findByUsername(username);
  if (existingUserByUsername) {
    username = username + Math.floor(Math.random() * 1000); // Evitar colisión simple
  }

  const password_hash = bcrypt.hashSync(password, 10);

  const newUser = await userRepository.createUser({
    username,
    email,
    password_hash,
    auth_provider: 'email',
    role
  });

  // Crear preferencias por defecto para el nuevo usuario
  await preferencesRepository.create(newUser.id, {});

  return newUser;
};

exports.login = async (data) => {
  const { email, password, rememberMe } = data;

  if (!email || !password) {
    throw new Error('Debe enviar email y password');
  }

  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new Error('No existe el usuario');
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    throw new Error('Contraseña incorrecta');
  }

  // Obtener o crear preferencias del usuario
  let preferences = await preferencesRepository.findByUserId(user.id);
  if (!preferences) {
    preferences = await preferencesRepository.create(user.id, {});
  }

  const token = createToken(user, rememberMe);

  return {
    message: 'Te has logueado correctamente',
    user: user.toJSON(),
    preferences: preferences.toJSON(),
    token
  };
};
exports.getUserById = async (id) => {
  const user = await userRepository.findById(id);
  if (!user) throw new Error('No existe el usuario');
  return user;
};

exports.updateProfile = async (userId, data) => {
  const { username, profile_image, currentPassword, newPassword } = data;

  // 1. Validar contraseña si se quiere cambiar
  if (newPassword) {
    if (!currentPassword) {
      throw new Error('Debe proporcionar la contraseña actual para cambiarla');
    }
    const user = await userRepository.findById(userId);
    const isMatch = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isMatch) {
      throw new Error('La contraseña actual es incorrecta');
    }
    const newHash = bcrypt.hashSync(newPassword, 10);
    await userRepository.updatePassword(userId, newHash);
  }

  // 2. Actualizar otros campos
  const updatedUser = await userRepository.updateProfile(userId, {
    username,
    profile_image: data.profile_image,
    profile_image_blob: data.profile_image_blob
  });

  return updatedUser;
};

exports.getPublicProfile = async (username) => {
  const user = await userRepository.findByUsername(username);
  if (!user) throw new Error('No existe el usuario');

  // Stats from observations
  const statsQuery = `
    SELECT 
      COUNT(o.id) as total_observations,
      COUNT(DISTINCT p.top_class) as total_species
    FROM observations.observations o
    LEFT JOIN ai.predictions p ON p.observation_id = o.id
    WHERE o.user_id = $1
  `;
  const pool = require('../config/database');
  const statsRes = await pool.query(statsQuery, [user.id]);
  const stats = statsRes.rows[0];

  return {
    user: user.toJSON(),
    stats: {
      observations: parseInt(stats.total_observations),
      species: parseInt(stats.total_species),
      identifications: parseInt(stats.total_observations), // For now same as observations
      followers: 0,
      joined: user.created_at,
      last_activity: user.updated_at || user.created_at
    }
  };
};
