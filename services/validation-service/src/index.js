const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'validation-service' }));

const PORT = process.env.PORT || 3007;
app.listen(PORT, () => console.log(`validation-service running on :${PORT}`));
