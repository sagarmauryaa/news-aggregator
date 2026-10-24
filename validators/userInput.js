const AppError = require('../utils/AppError');
const {
  BCRYPT_MAX_BYTES,
  EMAIL_PATTERN,
  NEWS_LANGUAGES,
  isValidPreferences,
} = require('./constants');

function requireName(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 100) {
    throw new AppError('Name is required', 400);
  }

  return value.trim();
}

function normalizeEmail(value) {
  if (typeof value !== 'string') {
    throw new AppError('Valid email is required', 400);
  }

  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new AppError('Valid email is required', 400);
  }

  return email;
}

function assertPassword(value) {
  if (typeof value !== 'string' || value.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  if (Buffer.byteLength(value, 'utf8') > BCRYPT_MAX_BYTES) {
    throw new AppError('Password must be at most 72 bytes', 400);
  }

  return value;
}

function assertPreferences(value) {
  if (!isValidPreferences(value)) {
    throw new AppError('Preferences must be an array of non-empty strings', 400);
  }

  return value.map((item) => item.trim());
}

function assertLanguage(value) {
  if (value === undefined) {
    return 'en';
  }

  if (typeof value !== 'string') {
    throw new AppError('Unsupported news language', 400);
  }

  const language = value.trim().toLowerCase();
  if (!NEWS_LANGUAGES.includes(language)) {
    throw new AppError('Unsupported news language', 400);
  }

  return language;
}

module.exports = {
  requireName,
  normalizeEmail,
  assertPassword,
  assertPreferences,
  assertLanguage,
};
