import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs/promises';
import path from 'path';
import QRCode from 'qrcode';
import pino from 'pino';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const sessions = new Map();
let ioInstance = null;

const MAX_RETRY_COUNT = 5;
const MAX_QR_ATTEMPTS = 5;

export const setIO = (io) => {
  ioInstance = io;
};

const getSessionDir = (sessionId) =>
  path.resolve(config.sessionsDir, sessionId);

const emitToSession = (sessionId, event, data) => {
  if (ioInstance) {
    ioInstance.of(`/${sessionId}`).emit(event, data);
  }
};

const ensureSessionDir = async (sessionId) => {
  const dir = getSessionDir(sessionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const deleteSessionDir = async (sessionId) => {
  const dir = getSessionDir(sessionId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (err) {
    logger.warn({ err, sessionId }, 'Failed to delete session directory');
  }
};

/**
 * Create a new WhatsApp session.
 * @param {string} sessionId
 * @param {'qr'|'code'} pairingMethod - 'qr' for QR scan, 'code' for pairing code via WhatsApp notification
 * @param {string|null} phoneNumber - Required when pairingMethod is 'code'. E.164 without + (e.g. 628123456789)
 */
export const createSession = async (sessionId, pairingMethod = 'qr', phoneNumber = null) => {
  if (sessions.has(sessionId)) {
    const existing = sessions.get(sessionId);
    if (existing.status === 'connected' || existing.status === 'connecting') {
      return { sessionId, status: existing.status, pairingMethod: existing.pairingMethod };
    }
  }

  if (pairingMethod === 'code' && !phoneNumber) {
    throw Object.assign(new Error('phoneNumber is required for pairing code method'), { statusCode: 400 });
  }

  const sessionDir = await ensureSessionDir(sessionId);
  const childLogger = pino({ level: 'silent' });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let pairingCode = null;

  const startSocket = async (retryCount = 0) => {
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, childLogger),
      },
      logger: childLogger,
      printQRInTerminal: false,
      browser: pairingMethod === 'code'
        ? ['Chrome (Linux)', '', '']
        : ['WhatsApp Session Manager', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    let qrAttempts = 0;
    let pairingCodeRequested = false;

    const sessionData = {
      sock,
      status: 'connecting',
      retryCount,
      sessionId,
      pairingMethod,
    };
    sessions.set(sessionId, sessionData);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && pairingMethod === 'qr') {
        // --- QR Code method ---
        qrAttempts++;
        sessionData.status = 'qr_required';

        try {
          const qrBase64 = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
          });
          emitToSession(sessionId, 'qr', qrBase64);
          logger.info({ sessionId, attempt: qrAttempts }, 'QR code generated');
        } catch (err) {
          logger.error({ err, sessionId }, 'Failed to generate QR code image');
        }

        if (qrAttempts >= MAX_QR_ATTEMPTS) {
          logger.warn({ sessionId }, 'Max QR attempts reached, closing');
          sessionData.status = 'closed';
          emitToSession(sessionId, 'disconnected', {
            reason: 'max_qr_attempts',
          });
          sock.end();
          sessions.delete(sessionId);
        }
      }

      if (qr && pairingMethod === 'code' && !pairingCodeRequested) {
        // --- Pairing Code method ---
        // Request pairing code on first QR event (socket is ready)
        pairingCodeRequested = true;
        sessionData.status = 'code_required';

        try {
          const cleanNumber = phoneNumber.replace(/\D/g, '');
          const code = await sock.requestPairingCode(cleanNumber);
          pairingCode = code;
          sessionData.pairingCode = code;

          emitToSession(sessionId, 'pairing_code', { code });
          logger.info({ sessionId, phoneNumber: cleanNumber }, 'Pairing code requested');
        } catch (err) {
          logger.error({ err, sessionId }, 'Failed to request pairing code');
          sessionData.status = 'closed';
          emitToSession(sessionId, 'disconnected', {
            reason: 'pairing_code_failed',
          });
          sock.end();
          sessions.delete(sessionId);
        }
      }

      if (connection === 'open') {
        sessionData.status = 'connected';
        sessionData.retryCount = 0;
        delete sessionData.pairingCode;
        emitToSession(sessionId, 'connected', { sessionId });
        logger.info({ sessionId }, 'Session connected');
      }

      if (connection === 'close') {
        const boom = lastDisconnect?.error;
        const statusCode =
          boom instanceof Boom
            ? boom.output.statusCode
            : boom?.output?.statusCode;

        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          logger.info({ sessionId }, 'Session logged out');
          sessionData.status = 'closed';
          emitToSession(sessionId, 'disconnected', { reason: 'logged_out' });
          sessions.delete(sessionId);
          await deleteSessionDir(sessionId);
        } else if (retryCount < MAX_RETRY_COUNT) {
          logger.info(
            { sessionId, retryCount: retryCount + 1, statusCode },
            'Reconnecting session'
          );
          sessionData.status = 'connecting';
          const delay = Math.min(1000 * 2 ** retryCount, 30000);
          await new Promise((r) => setTimeout(r, delay));
          await startSocket(retryCount + 1);
        } else {
          logger.warn({ sessionId }, 'Max retries reached, giving up');
          sessionData.status = 'closed';
          emitToSession(sessionId, 'disconnected', {
            reason: 'max_retries',
          });
          sessions.delete(sessionId);
        }
      }
    });

    return sessionData;
  };

  await startSocket(0);

  // Build response based on pairing method
  const response = { sessionId, pairingMethod };

  if (pairingMethod === 'qr') {
    response.status = 'qr_generated';
  } else {
    response.status = 'code_requested';
    if (pairingCode) {
      response.pairingCode = pairingCode;
    }
  }

  return response;
};

export const getSessionStatus = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return { sessionId, status: 'closed' };
  }
  return { sessionId, status: session.status };
};

export const checkNumber = async (sessionId, number) => {
  const session = sessions.get(sessionId);

  if (!session) {
    throw Object.assign(new Error('Session not found'), { statusCode: 404 });
  }

  if (session.status !== 'connected') {
    throw Object.assign(new Error('Session is not connected'), {
      statusCode: 400,
    });
  }

  const jid = `${number}@s.whatsapp.net`;

  try {
    const [result] = await session.sock.onWhatsApp(jid);

    if (result) {
      return { exists: result.exists, jid: result.jid };
    }

    return { exists: false, jid: null };
  } catch (err) {
    logger.error({ err, sessionId, number }, 'Failed to check number');
    throw Object.assign(new Error('Failed to check number on WhatsApp'), {
      statusCode: 500,
    });
  }
};

export const deleteSession = async (sessionId) => {
  const session = sessions.get(sessionId);

  if (!session) {
    throw Object.assign(new Error('Session not found'), { statusCode: 404 });
  }

  try {
    if (session.status === 'connected') {
      await session.sock.logout();
    } else {
      session.sock.end();
    }
  } catch (err) {
    logger.warn({ err, sessionId }, 'Error during session logout/close');
  }

  emitToSession(sessionId, 'disconnected', { reason: 'manual_logout' });
  sessions.delete(sessionId);
  await deleteSessionDir(sessionId);

  return { sessionId, status: 'closed' };
};

export const getAllSessions = () => {
  const result = [];
  for (const [sessionId, session] of sessions) {
    result.push({ sessionId, status: session.status });
  }
  return result;
};

export const shutdownAllSessions = async () => {
  logger.info(`Shutting down ${sessions.size} session(s)...`);
  const promises = [];

  for (const [sessionId, session] of sessions) {
    try {
      session.sock.end();
      logger.info({ sessionId }, 'Session closed');
    } catch (err) {
      logger.warn({ err, sessionId }, 'Error closing session');
    }
  }

  sessions.clear();
  await Promise.allSettled(promises);
  logger.info('All sessions shut down');
};
