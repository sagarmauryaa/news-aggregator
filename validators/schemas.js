const { z } = require('zod');

const requiredText = (label) => z.string().trim().min(1, `${label} is required`);

const preferenceItem = z
  .string()
  .trim()
  .min(1, 'Preference cannot be empty')
  .max(50, 'Preference must be at most 50 characters');

const preferences = z
  .array(preferenceItem, { error: 'Preferences must be an array' })
  .max(20, 'Preferences must contain at most 20 items');

const email = requiredText('Email').email('Valid email is required').toLowerCase();

const signupSchema = z.object({
  body: z.object({
    name: requiredText('Name').max(100, 'Name must be at most 100 characters'),
    email,
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .max(128, 'Password must be at most 128 characters'),
    preferences: preferences.optional(),
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

module.exports = {
  signupSchema,
  loginSchema,
  updatePreferencesSchema,
  searchSchema,
  articleParamsSchema,
};
