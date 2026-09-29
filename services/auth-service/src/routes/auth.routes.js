const router = require('express').Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Multer config for profile images
const uploadDir = path.join(__dirname, '../../uploads/profiles');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/auth/register
router.post('/register', authController.registrar);

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/me
router.get('/me', authMiddleware, authController.getMe);

// GET /api/auth/public/:username
router.get('/public/:username', authController.getPublicProfile);

// PUT /api/auth/profile
// Now supports optional file upload
router.put('/profile', authMiddleware, upload.single('image'), authController.updateProfile);

// POST /api/auth/dispositivos — el teléfono reporta modelo, versión y paquetes (C4)
router.post('/dispositivos', authMiddleware, require('../controllers/appAccountsController').reportDevice);

// Follows
router.post('/follow/:username', authMiddleware, authController.toggleFollow);
router.get('/follow/:username/status', authMiddleware, authController.getFollowStatus);
// Listas reales de seguidores/seguidos — pantalla Conexiones de la app.
router.get('/followers/:username', authController.listFollowers);
router.get('/following/:username', authController.listFollowing);

// GET /api/auth/google?platform=mobile — la app Android abre esto en Custom Tabs (sin SDK
// nativo de Google, sin un segundo cliente OAuth): reusa el mismo login que ya funciona
// para la web. `platform` viaja como `state` hasta el callback, sin sesión ni servidor de
// estado — Google lo devuelve tal cual.
router.get('/google', (req, res, next) => {
  const platform = req.query.platform === 'mobile' ? 'mobile' : 'web';
  passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: platform })(req, res, next);
});

// GET /api/auth/google/callback
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login' }), (req, res) => {
  console.log('✅ Google callback successful. User:', req.user.id, req.user.email, 'Role:', req.user.role);

  // Generar token JWT para el usuario autenticado (req.user)
  const jwt = require('jsonwebtoken');
  const config = require('../core/config');

  if (req.user.is_active === false) {
    const isMobileSuspended = req.query.state === 'mobile';
    const error = encodeURIComponent('Tu cuenta está suspendida');
    return res.redirect(
      isMobileSuspended ? `${config.mobileAuthScheme}?error=${error}` : `${config.frontendUrl}/login?error=${error}`
    );
  }

  const token = jwt.sign(
    { id: req.user.id, email: req.user.email, username: req.user.username, role: req.user.role },
    config.jwtSecret || process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '1d' }
  );

  const isMobile = req.query.state === 'mobile';
  const target = isMobile
    ? `${config.mobileAuthScheme}?token=${token}`
    : `${config.frontendUrl}/auth/callback?token=${token}`;
  console.log('🔗 Redirecting to:', isMobile ? config.mobileAuthScheme : `${config.frontendUrl}/auth/callback?token=…`);
  res.redirect(target);
});

module.exports = router;
