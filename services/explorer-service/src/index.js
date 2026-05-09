const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'explorer-service' }));

// Búsqueda avanzada y filtros ecológicos
app.get('/api/explorer/search', (req, res) => {
  // TODO: Implement advanced search with filters
  res.json({ message: 'Advanced search not implemented yet' });
});

// Estadísticas y Agregaciones
app.get('/api/explorer/stats', (req, res) => {
  // TODO: Implement statistics and aggregations
  res.json({ message: 'Statistics not implemented yet' });
});

// Rankings
app.get('/api/explorer/rankings', (req, res) => {
  // TODO: Implement rankings
  res.json({ message: 'Rankings not implemented yet' });
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => console.log(`explorer-service running on :${PORT}`));
