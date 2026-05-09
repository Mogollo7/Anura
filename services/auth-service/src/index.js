const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

// Routes
app.use('/api/auth', require('./api/auth.routes'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`auth-service running on :${PORT}`));
