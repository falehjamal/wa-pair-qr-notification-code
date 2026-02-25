import pino from 'pino';
import config from '../config/index.js';

const logger = pino({
  level: config.logLevel,
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const createChildLogger = (sessionId) =>
  logger.child({ sessionId });

export default logger;
