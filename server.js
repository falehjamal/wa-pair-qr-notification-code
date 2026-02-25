import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './src/app.js';
import config from './src/config/index.js';
import { initializeSocket } from './src/sockets/index.js';
import { shutdownAllSessions } from './src/services/sessionManager.js';
import logger from './src/utils/logger.js';

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
  path: '/socket.io',
});

initializeSocket(io);

app.set('io', io);

const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutdown signal received, cleaning up...');
  await shutdownAllSessions();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  logger.info(`Server listening on ${config.host}:${config.port}`);
});

export { io };
