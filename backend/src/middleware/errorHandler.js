function errorHandler(err, req, res, _next) {
  console.error(err.stack || err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
}

module.exports = { errorHandler };
