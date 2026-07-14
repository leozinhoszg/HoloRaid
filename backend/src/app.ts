import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { getConfig } from './config';
import { logger } from './common/logger/logger';
import { requestId } from './common/middleware/requestId';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { createAuthRouter } from './modules/auth/auth.router';
import type { AuthService } from './modules/auth/auth.service';

export function createApp(deps: { authService: AuthService }): Express {
  const cfg = getConfig();
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => (req as any).id }));
  app.use(helmet());
  app.use(cors({
    origin: cfg.CORS_ORIGINS.length ? cfg.CORS_ORIGINS : false,
    credentials: true,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false }));

  const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authLimiter, createAuthRouter(deps.authService));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
