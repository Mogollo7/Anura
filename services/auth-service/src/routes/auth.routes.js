const router = require('express').Router();
const passport = require('passport');
const authController = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', authController.registrar);

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/forgot-password
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', authController.resetPassword);

// GET /api/auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// GET /api/auth/google/callback
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login' }), (req, res) => {
  // Generar token JWT para el usuario autenticado (req.user)
  const jwt = require('jsonwebtoken');
  const config = require('../core/config');
  
  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, role: req.user.role },
    config.jwtSecret || process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '1d' }
  );

  // Redirigir al frontend con el token
  const frontendUrl = config.frontendUrl || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
});

module.exports = router;
