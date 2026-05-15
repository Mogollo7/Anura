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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `profile_${uuidv4()}${path.extname(file.originalname)}`)
});
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

// GET /api/auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// GET /api/auth/google/callback
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login' }), (req, res) => {
  console.log('✅ Google callback successful. User:', req.user.id, req.user.email, 'Role:', req.user.role);
  
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
  console.log('🔗 Redirecting to:', `${frontendUrl}/auth/callback?token=${token}`);
  res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
});

module.exports = router;
