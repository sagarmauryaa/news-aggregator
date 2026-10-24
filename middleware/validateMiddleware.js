const AppError = require('../utils/AppError');

function formatZodIssues(issues) {
  return issues.map((issue) => {
    const segments =
      issue.path[0] === 'body' || issue.path[0] === 'params' || issue.path[0] === 'query'
        ? issue.path.slice(1)
        : issue.path;

    return {
      field: segments.length > 0 ? segments.join('.') : 'body',
      message: issue.message,
    };
  });
}

function useParsed(req, key, value) {
  Object.defineProperty(req, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function validate(schema) {
  return function validateRequest(req, res, next) {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const err = new AppError('Validation failed', 400);
      err.errors = formatZodIssues(result.error.issues);
      return next(err);
    }

    if (Object.prototype.hasOwnProperty.call(result.data, 'body')) {
      useParsed(req, 'body', result.data.body);
    }

    if (Object.prototype.hasOwnProperty.call(result.data, 'params')) {
      useParsed(req, 'params', result.data.params);
    }

    if (Object.prototype.hasOwnProperty.call(result.data, 'query')) {
      useParsed(req, 'query', result.data.query);
    }

    return next();
  };
}

module.exports = validate;
