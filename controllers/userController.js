const User = require('../models/userModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { signUserToken } = require('../config/jwt');
const {
  requireName,
  normalizeEmail,
  assertPassword,
  assertPreferences,
  assertLanguage,
} = require('../validators/userInput');

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    preferences: user.preferences,
    language: user.language || 'en',
  };
}

const signup = asyncHandler(async (req, res) => {
  const name = requireName(req.body.name);
  const email = normalizeEmail(req.body.email);
  const password = assertPassword(req.body.password);
  const preferences = req.body.preferences === undefined ? [] : assertPreferences(req.body.preferences);
  const language = assertLanguage(req.body.language);

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('Email already registered', 400);
  }

  try {
    const user = await User.create({
      name,
      email,
      password,
      preferences,
      language,
    });

    return res.status(200).json({
      message: 'User created',
      user: publicUser(user),
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw new AppError('Email already registered', 400);
    }
    throw err;
  }
});

const login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = req.body.password;

  if (typeof password !== 'string' || password.length === 0) {
    throw new AppError('Password is required', 400);
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new AppError('Invalid email or password', 401);
  }

  return res.status(200).json({ token: signUserToken(user._id) });
});

const getPreferences = asyncHandler(async (req, res) => {
  return res.status(200).json({
    preferences: req.user.preferences,
    language: req.user.language || 'en',
  });
});

const updatePreferences = asyncHandler(async (req, res) => {
  const preferences = assertPreferences(req.body.preferences);
  req.user.preferences = preferences;

  if (req.body.language !== undefined) {
    req.user.language = assertLanguage(req.body.language);
  }

  await req.user.save();

  return res.status(200).json({
    preferences: req.user.preferences,
    language: req.user.language || 'en',
  });
});

module.exports = {
  signup,
  login,
  getPreferences,
  updatePreferences,
};
