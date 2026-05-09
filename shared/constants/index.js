/**
 * shared/constants/index.js
 * Global constants shared across Node services
 */

const SCHEMAS = {
  AUTH:          'auth',
  OBSERVATIONS:  'observations',
  SPECIES:       'species',
  GEO:           'geo',
  AI:            'ai',
  NOTIFICATIONS: 'notifications',
};

const OBSERVATION_STATUS = {
  PENDING:          'pending',
  AI_CLASSIFIED:    'ai_classified',
  EXPERT_VERIFIED:  'expert_verified',
};

const USER_ROLES = {
  USER:   'user',
  EXPERT: 'expert',
  ADMIN:  'admin',
};

const NOTIFICATION_TYPES = {
  PREDICTION_READY: 'prediction_ready',
  EXPERT_REVIEW:    'expert_review',
  SYSTEM:           'system',
};

module.exports = { SCHEMAS, OBSERVATION_STATUS, USER_ROLES, NOTIFICATION_TYPES };
