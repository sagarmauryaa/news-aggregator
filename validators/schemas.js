const { z } = require('zod');
const {
  BCRYPT_MAX_BYTES,
  NEWS_LANGUAGES,
  PREFERENCE_MAX_ITEMS,
  PREFERENCE_MAX_LENGTH,
} = require('./constants');

const requiredText = (label) => z.string().trim().min(1, `${label} is required`);

const preferenceItem = z
  .string()
  .trim()
  .min(1, 'Preference cannot be empty')
  .max(PREFERENCE_MAX_LENGTH, `Preference must be at most ${PREFERENCE_MAX_LENGTH} characters`);

const preferences = z
  .array(preferenceItem, { error: 'Preferences must be an array' })
  .max(PREFERENCE_MAX_ITEMS, `Preferences must contain at most ${PREFERENCE_MAX_ITEMS} items`);

const email = requiredText('Email').email('Valid email is required').toLowerCase();

const password = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_BYTES, {
    message: 'Password must be at most 72 bytes',
  });

const language = z.enum(NEWS_LANGUAGES, { error: 'Unsupported news language' });

const signupSchema = z.object({
  body: z.object({
    name: requiredText('Name').max(100, 'Name must be at most 100 characters'),
    email,
    password,
    preferences: preferences.optional(),
    language: language.optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string().min(1, 'Password is required'),
  }),
});

const updatePreferencesSchema = z.object({
  body: z.object({
    preferences,
    language: language.optional(),
  }),
});

const searchSchema = z.object({
  params: z.object({
    keyword: z.string().trim().min(1, 'Search keyword is required').max(200, 'Search keyword is too long'),
  }),
});

const articleParamsSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[a-f0-9]{16}$/i, 'Invalid article id'),
  }),
});

const newsQuerySchema = z.object({
  query: z.object({
    preferences: z.union([
      z.string().trim().min(1, 'Preference cannot be empty'),
      z.array(preferenceItem).min(1, 'Preference cannot be empty'),
    ]).optional(),
  }),
});

module.exports = {
  signupSchema,
  loginSchema,
  updatePreferencesSchema,
  searchSchema,
  articleParamsSchema,
  newsQuerySchema,
};
