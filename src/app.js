import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import { apiKeyAuth } from './middlewares/apiKeyAuth.js';
import { rateLimiter } from './middlewares/rateLimiter.js';
import { errorHandler } from './middlewares/errorHandler.js';
import sessionRoutes from './routes/sessionRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

app.use('/health', healthRoutes);

app.use('/api', apiKeyAuth);
app.use('/api/session', sessionRoutes);

app.use(errorHandler);

export default app;
