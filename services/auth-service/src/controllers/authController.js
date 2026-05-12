const authService = require('../services/authService');

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

exports.forgotPassword = async (req, res) => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    res.status(200).send(result);
  } catch (err) {
    if (err.message === 'Debe proporcionar un email') {
      return res.status(400).send({ message: err.message });
    }
    console.error(err);
    res.status(500).send({ message: 'Error al procesar recuperación' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const result = await authService.resetPassword(req.body);
    res.status(200).send(result);
  } catch (err) {
    if (err.message.includes('Faltan datos') || err.message === 'Código inválido o expirado') {
      return res.status(400).send({ message: err.message });
    }
    console.error(err);
    res.status(500).send({ message: 'Error al reiniciar contraseña' });
  }
};
