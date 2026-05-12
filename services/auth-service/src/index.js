const express = require('express');
const app = express();

app.use(express.json());

const passport = require('./config/passport');
app.use(passport.initialize());

// Health check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

// Database connection verification
const { runHealthCheck } = require('./utils/healthCheck');

// Routes
app.use('/api/auth', require('./routes/auth.routes'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`auth-service running on :${PORT}`);
  
  // Run health check on startup
  await runHealthCheck();
});
