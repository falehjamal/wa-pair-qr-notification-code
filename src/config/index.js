const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  apiKeys: process.env.API_KEYS
    ? process.env.API_KEYS.split(',').map((k) => k.trim()).filter(Boolean)
    : [],
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
  sessionsDir: process.env.SESSIONS_DIR || './sessions',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
};

export default config;
