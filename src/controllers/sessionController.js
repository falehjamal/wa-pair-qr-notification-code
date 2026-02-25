import { v4 as uuidv4 } from 'uuid';
import {
  createSession as createSessionService,
  getSessionStatus,
  checkNumber as checkNumberService,
  deleteSession as deleteSessionService,
  getAllSessions,
} from '../services/sessionManager.js';
import { sendSuccess, sendError } from '../utils/response.js';
import logger from '../utils/logger.js';

export const createSession = async (req, res, next) => {
  try {
    let { sessionId, pairingMethod, phoneNumber } = req.body || {};

    if (!sessionId) {
      sessionId = uuidv4();
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return sendError(
        res,
        'Invalid sessionId. Use only alphanumeric, hyphens and underscores.',
        400
      );
    }

    // Default to QR method
    if (!pairingMethod) {
      pairingMethod = 'qr';
    }

    if (!['qr', 'code'].includes(pairingMethod)) {
      return sendError(
        res,
        'Invalid pairingMethod. Use "qr" or "code".',
        400
      );
    }

    if (pairingMethod === 'code') {
      if (!phoneNumber) {
        return sendError(
          res,
          'phoneNumber is required when pairingMethod is "code". Use E.164 without + (e.g., 628123456789).',
          400
        );
      }

      const cleaned = phoneNumber.replace(/\D/g, '');
      if (cleaned.length < 7 || cleaned.length > 15) {
        return sendError(
          res,
          'Invalid phoneNumber format. Use E.164 without + (e.g., 628123456789).',
          400
        );
      }
      phoneNumber = cleaned;
    }

    const result = await createSessionService(sessionId, pairingMethod, phoneNumber);

    return sendSuccess(res, result, 'Session created', 201);
  } catch (err) {
    next(err);
  }
};

export const getStatus = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return sendError(res, 'sessionId is required', 400);
    }

    const result = getSessionStatus(sessionId);

    return sendSuccess(res, result, 'Session status retrieved');
  } catch (err) {
    next(err);
  }
};

export const checkNumber = async (req, res, next) => {
  try {
    const { sessionId, number } = req.body || {};

    if (!sessionId) {
      return sendError(res, 'sessionId is required', 400);
    }

    if (!number) {
      return sendError(res, 'number is required', 400);
    }

    const cleaned = number.replace(/\D/g, '');

    if (cleaned.length < 7 || cleaned.length > 15) {
      return sendError(
        res,
        'Invalid number format. Use E.164 without + (e.g., 628123456789)',
        400
      );
    }

    const result = await checkNumberService(sessionId, cleaned);

    return sendSuccess(res, result, 'Number check completed');
  } catch (err) {
    next(err);
  }
};

export const removeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return sendError(res, 'sessionId is required', 400);
    }

    const result = await deleteSessionService(sessionId);

    return sendSuccess(res, result, 'Session deleted');
  } catch (err) {
    next(err);
  }
};

export const listSessions = async (req, res, next) => {
  try {
    const result = getAllSessions();

    return sendSuccess(res, { sessions: result }, 'Sessions retrieved');
  } catch (err) {
    next(err);
  }
};
