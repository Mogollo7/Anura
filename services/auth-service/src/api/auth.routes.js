const router = require('express').Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  // TODO: validate body, hash password, insert into auth.users
  res.status(501).json({ message: 'Not implemented yet' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  // TODO: validate credentials, return JWT
  res.status(501).json({ message: 'Not implemented yet' });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  // TODO: verify refresh token, issue new access token
  res.status(501).json({ message: 'Not implemented yet' });
});

module.exports = router;
