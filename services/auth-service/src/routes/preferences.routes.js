const router = require('express').Router();
const preferencesController = require('../controllers/preferencesController');
const passport = require('passport');

// GET /api/preferences
router.get('/', passport.authenticate('jwt', { session: false }), preferencesController.getPreferences);

// PUT /api/preferences
router.put('/', passport.authenticate('jwt', { session: false }), preferencesController.updatePreferences);

module.exports = router;