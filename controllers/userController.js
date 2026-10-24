const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

function createToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'dev-secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

const signup = asyncHandler(async (req, res) => {
  const { name, email, password, preferences } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('Email already registered', 400);
  }

  const user = await User.create({
    name,
    email,
    password,
    preferences: preferences || [],
  });

  return res.status(200).json({
    message: 'User created',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      preferences: user.preferences,
    },
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new AppError('Invalid email or password', 401);
  }

  return res.status(200).json({ token: createToken(user._id) });
});

const getPreferences = asyncHandler(async (req, res) => {
  return res.status(200).json({ preferences: req.user.preferences });
});

const updatePreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;

  req.user.preferences = preferences;
  await req.user.save();

  return res.status(200).json({ preferences: req.user.preferences });
});

module.exports = {
  signup,
  login,
  getPreferences,
  updatePreferences,
};
