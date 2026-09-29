const jwt = require('jsonwebtoken');

// Sin JWT_SECRET no se arranca: con un valor por defecto en el código, cualquiera podría firmarse un token.
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET no está definido: observation-service no arranca sin él.');
  process.exit(1);
}

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
