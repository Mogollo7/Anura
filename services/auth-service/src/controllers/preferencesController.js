const preferencesService = require('../services/preferencesService');

exports.getPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = await preferencesService.getPreferences(userId);
    console.log('GET preferences for user:', userId, preferences.toJSON());
    res.status(200).json(preferences.toJSON());
  } catch (err) {
    console.error('Error getting preferences:', err);
    res.status(500).json({ message: 'Error al obtener preferencias' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('PUT preferences for user:', userId, req.body);
    const preferences = await preferencesService.updatePreferences(userId, req.body);
    console.log('Saved preferences:', preferences.toJSON());
    res.status(200).json(preferences.toJSON());
  } catch (err) {
    console.error('Error updating preferences:', err);
    res.status(500).json({ message: 'Error al actualizar preferencias' });
  }
};