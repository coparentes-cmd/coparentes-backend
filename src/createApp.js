import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import inviteRoutes from './routes/invite.js';
import threadRoutes from './routes/threads.js';
import exportRoutes from './routes/exports.js';
import calendarRoutes from './routes/calendar.js';
import financeRoutes from './routes/finances.js';
import documentRoutes from './routes/documents.js';
import workspaceRoutes from './routes/workspace.js';
import { createCorsMiddleware } from './middleware/cors.js';
import {
  applySecurityHeaders,
  enforceHttps,
  rejectInsecureApi
} from './middleware/security.js';
import { env } from './utils/env.js';
import { prisma } from './lib/prisma.js';

/**
 * Express app factory (Stack A — Prisma/PostgreSQL).
 * Mounted paths match Flutter AppApiClient (baseUrl ends with /api).
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(enforceHttps);
  app.use(rejectInsecureApi);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
      hsts: false,
      frameguard: false,
      xContentTypeOptions: false,
      xXssProtection: false
    })
  );
  app.use(applySecurityHeaders);
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'coparentes-backend',
      environment: env.nodeEnv,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'ready',
        database: 'ok',
        environment: env.nodeEnv
      });
    } catch (error) {
      console.error(error);
      res.status(503).json({ status: 'not_ready', database: 'error' });
    }
  });

  // Flutter: AuthRepository (limiter tylko na register/join/login w routes/auth.js)
  app.use('/api/auth', authRoutes);

  // Flutter: optional email invites
  app.use('/api/invite', inviteRoutes);

  // Flutter: workspace graph
  app.use('/api/workspace', workspaceRoutes);

  // Flutter: MessagingRepository
  app.use('/api/threads', threadRoutes);

  // Flutter: ExportRepository
  app.use('/api/exports', exportRoutes);

  // Flutter: CalendarRepository
  app.use('/api/calendar', calendarRoutes);

  // Flutter: FinanceRepository
  app.use('/api/finances', financeRoutes);

  // Flutter: DocumentsRepository
  app.use('/api/documents', documentRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((error, _req, res, _next) => {
    if (error?.message === 'user_missing_workspace') {
      return res.status(403).json({ error: 'user_missing_workspace' });
    }

    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'invalid_request',
        details: error.flatten()
      });
    }

    console.error(error);
    res.status(500).json({
      error: 'internal_server_error',
      ...(env.nodeEnv === 'production' ? {} : { message: error?.message ?? 'unknown_error' })
    });
  });

  return app;
}
