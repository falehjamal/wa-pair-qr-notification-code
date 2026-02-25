import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import { apiKeyAuth } from './middlewares/apiKeyAuth.js';
import { rateLimiter } from './middlewares/rateLimiter.js';
import { errorHandler } from './middlewares/errorHandler.js';
import sessionRoutes from './routes/sessionRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// Serve test panel static files
app.use('/panel', express.static(path.join(__dirname, '..', 'test-web')));

app.use('/health', healthRoutes);

app.use('/api', apiKeyAuth);
app.use('/api/session', sessionRoutes);

app.use(errorHandler);

export default app;
