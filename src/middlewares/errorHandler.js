import logger from '../utils/logger.js';
import { sendError } from '../utils/response.js';

export const errorHandler = (err, req, res, _next) => {
  logger.error({ err, method: req.method, url: req.url }, 'Unhandled error');

  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  sendError(res, message, statusCode);
};
