const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'observation-service' }));

app.use('/api/observations', require('./api/observation.routes'));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`observation-service running on :${PORT}`));
