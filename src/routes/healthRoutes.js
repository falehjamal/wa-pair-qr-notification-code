import { Router } from 'express';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.get('/', (req, res) => {
  sendSuccess(
    res,
    {
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      memoryUsage: process.memoryUsage().rss,
    },
    'OK'
  );
});

export default router;
