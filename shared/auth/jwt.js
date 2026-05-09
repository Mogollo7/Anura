/**
 * shared/auth/jwt.js
 * JWT helpers shared across Node services
 */
const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES_IN || '15m';

const sign = (payload) => jwt.sign(payload, SECRET, { expiresIn: EXPIRES });

const verify = (token) => jwt.verify(token, SECRET);

/**
 * Express middleware – attaches decoded user to req.user
 */
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    req.user = verify(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { sign, verify, requireAuth };
