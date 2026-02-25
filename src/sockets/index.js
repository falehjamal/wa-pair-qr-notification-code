import logger from '../utils/logger.js';
import { setIO } from '../services/sessionManager.js';

export const initializeSocket = (io) => {
  setIO(io);

  const dynamicNsp = io.of(/^\/.+$/);

  dynamicNsp.on('connection', (socket) => {
    const namespace = socket.nsp.name;
    const sessionId = namespace.replace('/', '');

    logger.info(
      { sessionId, socketId: socket.id },
      'Client connected to session namespace'
    );

    socket.on('disconnect', (reason) => {
      logger.info(
        { sessionId, socketId: socket.id, reason },
        'Client disconnected from session namespace'
      );
    });
  });

  logger.info('Socket.IO initialized with dynamic namespaces');
};
