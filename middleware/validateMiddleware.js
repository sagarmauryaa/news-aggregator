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

    if (result.data.body !== undefined) {
      req.body = result.data.body;
    }

    if (result.data.params) {
      Object.assign(req.params, result.data.params);
    }

    if (result.data.query) {
      Object.assign(req.query, result.data.query);
    }

    return next();
  };
}

module.exports = validate;
