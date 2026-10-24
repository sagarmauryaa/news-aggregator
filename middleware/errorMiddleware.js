const AppError = require('../utils/AppError');

function notFoundHandler(req, res, next) {
  next(new AppError('Route not found', 404));
}

function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }

  const status = err.status || 500;
  const message = err.status ? err.message : 'Internal server error';

  if (status >= 500) {
    console.error(err);
  }

  return res.status(status).json({
    message,
    ...(err.errors ? { errors: err.errors } : {}),
  });
}

module.exports = { notFoundHandler, errorHandler };
