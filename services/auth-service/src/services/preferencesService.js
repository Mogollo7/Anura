const preferencesRepository = require('../repositories/preferencesRepository');

exports.getPreferences = async (userId) => {
  let preferences = await preferencesRepository.findByUserId(userId);
  
  if (!preferences) {
    preferences = await preferencesRepository.create(userId, {});
  }
  
  return preferences;
};

exports.updatePreferences = async (userId, preferencesData) => {
  const preferences = await preferencesRepository.upsert(userId, preferencesData);
  return preferences;
};