const { ZodError } = require('zod');
const AppError = require('../utils/AppError');
const { formatZodIssues } = require('./validate');

function notFoundHandler(req, res, next) {
  next(new AppError('Route not found', 404));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors;

  if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    errors = formatZodIssues(err.issues);
  } else if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && status === 400)) {
    status = 400;
    message = 'Invalid JSON body';
  } else if (err.name === 'ValidationError' && err.errors && !Array.isArray(err.errors)) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid data type';
    errors = [{ field: err.path || 'body', message: 'Invalid value' }];
  } else if (err.code === 11000) {
    status = 400;
    message = 'Email already registered';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Unauthorized: invalid token';
  } else if (Array.isArray(err.errors)) {
    errors = err.errors;
  }

  if (status >= 500) {
    console.error(err);
  }

  return res.status(status).json({
    message,
    ...(errors ? { errors } : {}),
  });
}

module.exports = { notFoundHandler, errorHandler };
