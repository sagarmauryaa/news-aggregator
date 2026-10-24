const mongoose = require('mongoose');
const User = require('../models/userModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../config/jwt');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || typeof header !== 'string') {
    throw new AppError('Unauthorized: token required', 401);
  }

  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) {
    throw new AppError('Unauthorized: token required', 401);
  }

  const payload = verifyToken(match[1]);
  const userId = payload && payload.userId;
  if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError('Unauthorized: invalid token', 401);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('Unauthorized: user not found', 401);
  }

  req.user = user;
  return next();
});

module.exports = authenticate;
