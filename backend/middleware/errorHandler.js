/**
 * Catches requests to routes that don't exist and forwards a 404 error.
 */
export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Centralized error handler. Any error passed to next(err) ends up here.
 */
export const errorHandler = (err, req, res, next) => {
  // If a status code was already set (e.g. via res.status(400)), use it;
  // otherwise default to 500.
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};
