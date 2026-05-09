const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'thumbnail-service' }));

app.use('/api/thumbnails', require('./resize/resize.routes'));

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => console.log(`thumbnail-service running on :${PORT}`));
