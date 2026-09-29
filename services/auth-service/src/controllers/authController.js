const authService = require('../services/authService');
const { uploadProfileImage } = require('../services/minioUpload');

exports.registrar = async (req, res) => {
  try {
    const usuario = await authService.registrar(req.body);
    res.status(201).send({ usuario });
  } catch (err) {
    if (err.message.includes('Debe enviar')) {
      return res.status(400).send({ message: err.message });
    }
    if (err.message === 'El email ya está registrado') {
      return res.status(409).send({ message: err.message });
    }
    console.error(err);
    res.status(500).send({ message: 'Error al registrar el usuario' });
  }
};

exports.login = async (req, res) => {
  try {
    const result = await authService.login(req.body);
    res.status(200).send(result);
  } catch (err) {
    if (err.message === 'Debe enviar email y password') {
      return res.status(400).send({ message: 'Escribe tu correo y tu contraseña.' });
    }
    if (err.message === 'Credenciales incorrectas') {
      return res.status(401).send({ message: 'El correo o la contraseña no coinciden.' });
    }
    if (err.message === 'Cuenta de Google') {
      return res.status(401).send({ message: 'Esta cuenta entra con Google. Usa «Continuar con Google».' });
    }
    if (err.message === 'Cuenta suspendida') {
      return res.status(403).send({ message: 'Tu cuenta está suspendida. Escribe al equipo de ANURA si crees que es un error.' });
    }
    console.error(err);
    res.status(500).send({ message: 'No se pudo iniciar sesión. Intenta de nuevo en un momento.' });
  }
};
exports.getMe = async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.id);
    res.status(200).json({ user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      const fs = require('fs');
      const path = require('path');
      const sharp = require('sharp');
      const { v4: uuidv4 } = require('uuid');

      const filename = `profile_${uuidv4()}.webp`;
      const filePath = path.join(__dirname, '../../uploads/profiles', filename);

      const webpBuffer = await sharp(req.file.buffer).webp({ quality: 80 }).toBuffer();
      fs.writeFileSync(filePath, webpBuffer);

      data.profile_image = `/uploads/profiles/${filename}`;
      data.profile_image_blob = webpBuffer;
      try {
        await uploadProfileImage(filePath, filename);
      } catch (minioErr) {
        console.warn('[minio] Perfil no replicado al bucket:', minioErr.message);
      }
    }
    const updatedUser = await authService.updateProfile(req.user.id, data);
    res.status(200).json({ 
      message: 'Perfil actualizado correctamente', 
      user: updatedUser.toJSON() 
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getPublicProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const profile = await authService.getPublicProfile(username);
    res.status(200).json(profile);
  } catch (err) {
    if (err.message === 'No existe el usuario') {
      return res.status(404).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.toggleFollow = async (req, res) => {
  try {
    const { username } = req.params;
    const result = await authService.toggleFollow(req.user.id, username);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getFollowStatus = async (req, res) => {
  try {
    const { username } = req.params;
    const result = await authService.getFollowStatus(req.user.id, username);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listFollowers = async (req, res) => {
  try {
    const { username } = req.params;
    const result = await authService.listFollowers(username);
    res.status(200).json(result);
  } catch (err) {
    if (err.message === 'No existe el usuario') {
      return res.status(404).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.listFollowing = async (req, res) => {
  try {
    const { username } = req.params;
    const result = await authService.listFollowing(username);
    res.status(200).json(result);
  } catch (err) {
    if (err.message === 'No existe el usuario') {
      return res.status(404).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
};
