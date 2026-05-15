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
      return res.status(400).send({ message: err.message });
    }
    if (err.message === 'No existe el usuario') {
      return res.status(404).send({ message: err.message });
    }
    if (err.message === 'Contraseña incorrecta') {
      return res.status(401).send({ message: err.message });
    }
    console.error(err);
    res.status(500).send({ message: 'Error al realizar el login' });
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
      data.profile_image = `/uploads/profiles/${req.file.filename}`;
      data.profile_image_blob = fs.readFileSync(req.file.path);
      try {
        await uploadProfileImage(req.file.path, req.file.filename);
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
