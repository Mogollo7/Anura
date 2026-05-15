const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const config = require('../core/config');
const userRepository = require('../repositories/userRepository');
const bcrypt = require('bcryptjs');

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.jwtSecret || process.env.JWT_SECRET || 'fallback_secret'
};

passport.use(
  new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      const user = await userRepository.findById(payload.id);
      if (user) {
        return done(null, user);
      }
      return done(null, false);
    } catch (err) {
      return done(err, false);
    }
  })
);

// Verificar que las variables de Google estén definidas, sino puede dar error al iniciar Passport
if (config.google.clientId && config.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          
          if (!email) {
            return done(new Error('No email found from Google profile'), false);
          }

          // Buscar primero por google_id
          let user = await userRepository.findByGoogleId(profile.id);

          if (!user) {
            // Si no existe por google_id, buscar por email
            user = await userRepository.findByEmail(email);

            if (!user) {
              // Si tampoco existe por email, creamos un nuevo usuario
              const username = profile.displayName ? profile.displayName.replace(/\s+/g, '').toLowerCase() + '_' + Math.floor(Math.random() * 1000) : email.split('@')[0] + '_' + Math.floor(Math.random() * 10000);
              const profile_image = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

              user = await userRepository.createUser({
                username,
                email,
                auth_provider: 'google',
                google_id: profile.id,
                profile_image,
                role: 'user'
              });
            } else {
              // Si existe por email pero no tenía google_id, podrías actualizarlo aquí (opcional)
              // Por ahora lo dejamos pasar para permitir el login
            }
          }

          return done(null, user);
        } catch (err) {
          return done(err, false);
        }
      }
    )
  );
} else {
  console.warn('Google OAuth credentials not provided. Google login will fail.');
}

module.exports = passport;
