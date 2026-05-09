const router  = require('express').Router();
const multer  = require('multer');
const upload  = multer({ storage: multer.memoryStorage() });

// GET /api/observations
router.get('/', async (req, res) => {
  // TODO: query observations.observations with pagination
  res.status(501).json({ message: 'Not implemented yet' });
});

// POST /api/observations  (multipart: image + metadata)
router.post('/', upload.single('image'), async (req, res) => {
  // TODO: upload image to MinIO, insert record, emit event to ai-service
  res.status(501).json({ message: 'Not implemented yet' });
});

// GET /api/observations/:id
router.get('/:id', async (req, res) => {
  res.status(501).json({ message: 'Not implemented yet' });
});

module.exports = router;
