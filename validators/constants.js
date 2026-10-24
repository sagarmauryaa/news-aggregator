const BCRYPT_MAX_BYTES = 72;
const PREFERENCE_MAX_LENGTH = 50;
const PREFERENCE_MAX_ITEMS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEWS_LANGUAGES = Object.freeze([
  'ar',
  'de',
  'en',
  'es',
  'fr',
  'he',
  'it',
  'nl',
  'no',
  'pt',
  'ru',
  'sv',
  'ud',
  'zh',
]);

function isValidPreferences(value) {
  if (!Array.isArray(value) || value.length > PREFERENCE_MAX_ITEMS) {
    return false;
  }

  return value.every((item) => {
    return typeof item === 'string'
      && item.trim().length > 0
      && item.trim().length <= PREFERENCE_MAX_LENGTH;
  });
}

module.exports = {
  BCRYPT_MAX_BYTES,
  PREFERENCE_MAX_LENGTH,
  PREFERENCE_MAX_ITEMS,
  EMAIL_PATTERN,
  NEWS_LANGUAGES,
  isValidPreferences,
};
