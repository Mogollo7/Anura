const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
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

  const token = createToken(user, rememberMe);

  return {
    message: 'Te has logueado correctamente',
    user: user.toJSON(),
    token
  };
};

exports.forgotPassword = async (email) => {
  if (!email) throw new Error('Debe proporcionar un email');

  const user = await userRepository.findByEmail(email);
  if (!user) {
    // Para no revelar qué emails están registrados, no lanzamos error
    return { message: 'Si el correo existe, se enviará un código' };
  }

  // Generar código numérico de 6 dígitos
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await userRepository.createResetCode(user.id, code);

  // TODO: Integrar envío de email (e.g. Nodemailer/SendGrid)
  console.log(`[SIMULACIÓN] Código de recuperación para ${email}: ${code}`);

  return { message: 'Si el correo existe, se enviará un código' };
};

exports.resetPassword = async (data) => {
  const { email, code, newPassword } = data;

  if (!email || !code || !newPassword) {
    throw new Error('Faltan datos (email, codigo, nueva_contrasena)');
  }

  const resetRecord = await userRepository.verifyResetCode(email, code);
  if (!resetRecord) {
    throw new Error('Código inválido o expirado');
  }

  const password_hash = bcrypt.hashSync(newPassword, 10);
  await userRepository.updatePassword(resetRecord.user_id, password_hash);
  await userRepository.markResetCodeAsUsed(resetRecord.id);

  return { message: 'Contraseña actualizada correctamente' };
};
