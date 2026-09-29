// Sin JWT_SECRET no se arranca: los "|| 'fallback_secret'" que quedan por el código firmarían y
// aceptarían tokens con una clave que está en el repositorio.
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET no está definido: auth-service no arranca sin él.');
  process.exit(1);
}

module.exports = {
  port: process.env.PORT || 3001,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  jwtSecret: process.env.JWT_SECRET,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  // A dónde vuelve el login de Google iniciado desde la app Android (Custom Tabs, sin SDK
  // nativo de Google ni un segundo cliente OAuth que registrar). MainActivity intercepta
  // este esquema por intent-filter.
  mobileAuthScheme: process.env.MOBILE_AUTH_SCHEME || 'anura://auth/callback',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL
  }
};
