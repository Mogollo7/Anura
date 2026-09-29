const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const preferencesRepository = require('../repositories/preferencesRepository');
const config = require('../core/config');

const createToken = (user, rememberMe = false) => {
  const expiresIn = rememberMe ? '30d' : '1d';
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username, role: user.role },
    config.jwtSecret || process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn }
  );
};

exports.registrar = async (data) => {
  // El rol nunca viene del formulario: toda cuenta nueva es de usuario. Solo el panel lo cambia.
  let { username, email, password, biography } = data;

  if (!email || !password) {
    throw new Error('Debe enviar email y password');
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new Error('Debe enviar email y password');
  }
  email = email.trim().toLowerCase();

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
    biography
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

  // Mismo mensaje si el correo no existe o la contraseña no coincide: no revela qué correos
  // tienen cuenta.
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new Error('Credenciales incorrectas');
  }
  if (!user.password_hash) {
    throw new Error('Cuenta de Google');
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    throw new Error('Credenciales incorrectas');
  }

  if (user.is_active === false) {
    throw new Error('Cuenta suspendida');
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
  const { username, biography, profile_image, currentPassword, newPassword } = data;

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
    biography,
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

  // Follower count
  const followRes = await pool.query('SELECT COUNT(*) as followers FROM auth.follows WHERE followee_id = $1', [user.id]);
  const followersCount = parseInt(followRes.rows[0].followers);

  // Following count
  const followingRes = await pool.query('SELECT COUNT(*) as following FROM auth.follows WHERE follower_id = $1', [user.id]);
  const followingCount = parseInt(followingRes.rows[0].following);

  return {
    user: user.toPublicJSON(),
    stats: {
      observations: parseInt(stats.total_observations),
      species: parseInt(stats.total_species),
      followers: followersCount,
      following: followingCount,
      joined: user.created_at,
      last_activity: user.updated_at || user.created_at
    }
  };
};

exports.toggleFollow = async (followerId, usernameToFollow) => {
  const userRepository = require('../repositories/userRepository');
  const pool = require('../config/database');

  const followingUser = await userRepository.findByUsername(usernameToFollow);
  if (!followingUser) throw new Error('Usuario no encontrado');

  if (followerId === followingUser.id) throw new Error('No puedes seguirte a ti mismo');

  // Check if following
  const checkQuery = 'SELECT 1 FROM auth.follows WHERE follower_id = $1 AND followee_id = $2';
  const checkRes = await pool.query(checkQuery, [followerId, followingUser.id]);

  if (checkRes.rows.length > 0) {
    // Unfollow
    await pool.query('DELETE FROM auth.follows WHERE follower_id = $1 AND followee_id = $2', [followerId, followingUser.id]);
    return { following: false };
  } else {
    // Follow
    await pool.query('INSERT INTO auth.follows (follower_id, followee_id) VALUES ($1, $2)', [followerId, followingUser.id]);
    return { following: true };
  }
};

exports.getFollowStatus = async (followerId, usernameToCheck) => {
  const userRepository = require('../repositories/userRepository');
  const pool = require('../config/database');

  const targetUser = await userRepository.findByUsername(usernameToCheck);
  if (!targetUser) return { following: false };

  const checkQuery = 'SELECT 1 FROM auth.follows WHERE follower_id = $1 AND followee_id = $2';
  const checkRes = await pool.query(checkQuery, [followerId, targetUser.id]);

  return { following: checkRes.rows.length > 0 };
};

/** Cuentas reales que siguen a `username` — pantalla Conexiones de la app (antes CommunityCatalog). */
exports.listFollowers = async (username) => {
  const userRepository = require('../repositories/userRepository');
  const pool = require('../config/database');

  const targetUser = await userRepository.findByUsername(username);
  if (!targetUser) throw new Error('No existe el usuario');

  const result = await pool.query(
    `SELECT u.username, u.profile_image, u.biography
     FROM auth.follows f
     JOIN auth.users u ON u.id = f.follower_id
     WHERE f.followee_id = $1
     ORDER BY u.username`,
    [targetUser.id]
  );
  return result.rows;
};

/** Cuentas reales que `username` sigue. */
exports.listFollowing = async (username) => {
  const userRepository = require('../repositories/userRepository');
  const pool = require('../config/database');

  const targetUser = await userRepository.findByUsername(username);
  if (!targetUser) throw new Error('No existe el usuario');

  const result = await pool.query(
    `SELECT u.username, u.profile_image, u.biography
     FROM auth.follows f
     JOIN auth.users u ON u.id = f.followee_id
     WHERE f.follower_id = $1
     ORDER BY u.username`,
    [targetUser.id]
  );
  return result.rows;
};
