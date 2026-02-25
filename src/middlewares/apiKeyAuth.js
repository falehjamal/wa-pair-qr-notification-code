import config from '../config/index.js';
import { sendError } from '../utils/response.js';

export const apiKeyAuth = (req, res, next) => {
  if (!config.apiKeys.length) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return sendError(res, 'API key is required. Provide it via x-api-key header.', 401);
  }

  if (!config.apiKeys.includes(apiKey)) {
    return sendError(res, 'Invalid API key.', 401);
  }

  next();
};
