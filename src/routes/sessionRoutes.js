import { Router } from 'express';
import {
  createSession,
  getStatus,
  checkNumber,
  removeSession,
  listSessions,
} from '../controllers/sessionController.js';

const router = Router();

router.post('/create', createSession);

router.get('/status/:sessionId', getStatus);

router.post('/check-number', checkNumber);

router.delete('/:sessionId', removeSession);

router.get('/list', listSessions);

export default router;
