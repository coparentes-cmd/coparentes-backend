import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import inviteRoutes from './routes/invite.js';
import { env } from './utils/env.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: env.frontendUrl,
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again later' }
});

app.get('/health', (_req, res) => {
  return res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/invite', inviteRoutes);

app.use((_req, res) => {
  return res.status(404).json({ error: 'Not found' });
});

app.use((error, _req, res, _next) => {
  if (error?.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      details: error.flatten()
    });
  }

  console.error(error);
  return res.status(500).json({
    error: 'Internal server error'
  });
});

app.listen(env.port, () => {
  console.log(`Coparentes API listening on port ${env.port}`);
});
