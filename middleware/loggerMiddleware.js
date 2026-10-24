function requestPath(req) {
  const raw = req.originalUrl || req.url || '';
  const queryIndex = raw.indexOf('?');
  return queryIndex === -1 ? raw : raw.slice(0, queryIndex);
}

function logger(req, res, next) {
  const started = Date.now();
  const path = requestPath(req);

  res.on('finish', () => {
    console.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
  });

  next();
}

module.exports = logger;
