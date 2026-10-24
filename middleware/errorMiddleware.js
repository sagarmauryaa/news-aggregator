const AppError = require('../utils/AppError');

function notFoundHandler(req, res, next) {
  next(new AppError('Route not found', 404));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }

  if (err && err.code === 11000) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  if (err && err.name === 'ValidationError' && !err.status) {
    return res.status(400).json({ message: err.message });
  }

  const status = err.status || 500;
  const message = err.status ? err.message : 'Internal server error';

  if (status >= 500) {
    console.error(err);
  }

  return res.status(status).json({
    message,
    ...(Array.isArray(err.errors) ? { errors: err.errors } : {}),
  });
}

module.exports = { notFoundHandler, errorHandler };
