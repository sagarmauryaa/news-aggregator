const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');

const MIN_SECRET_LENGTH = 32;

function jwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new AppError('JWT_SECRET is not configured', 500);
  }

  if (secret === 'dev-secret') {
    throw new AppError('JWT_SECRET is not configured', 500);
  }

  return secret;
}

function signUserToken(userId) {
  return jwt.sign({ userId: String(userId) }, jwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function verifyToken(token) {
  const secret = jwtSecret();

  try {
    return jwt.verify(token, secret);
  } catch (err) {
    throw new AppError('Unauthorized: invalid token', 401);
  }
}

module.exports = {
  jwtSecret,
  signUserToken,
  verifyToken,
};
