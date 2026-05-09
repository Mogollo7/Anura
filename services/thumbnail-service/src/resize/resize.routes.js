const router = require('express').Router();
const sharp  = require('sharp');

// POST /api/thumbnails  { body: { imageBuffer (base64) | use middleware } }
// Called internally by observation-service after upload
router.post('/', async (req, res) => {
  const { base64, width = 400, height = 400 } = req.body;
  if (!base64) return res.status(400).json({ error: 'base64 image required' });
  try {
    const buffer = Buffer.from(base64, 'base64');
    const thumbnail = await sharp(buffer)
      .resize(width, height, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
    res.set('Content-Type', 'image/webp');
    res.send(thumbnail);
  } catch (e) {
    res.status(500).json({ error: 'Resize failed', detail: e.message });
  }
});

module.exports = router;
