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
import { createUsersRouter } from './modules/users/users.router';
import { createReferenceRouter } from './modules/reference/reference.router';
import { createCharactersRouter } from './modules/characters/characters.router';
import { createProgressionRouter } from './modules/progression/progression.router';
import { createRaidsRouter } from './modules/raids/raids.router';
import type { AuthService } from './modules/auth/auth.service';
import type { UserService } from './modules/users/users.service';
import type { CharacterService } from './modules/characters/characters.service';
import type { ProgressionService } from './modules/progression/progression.service';
import type { BossRepo } from './db/repositories/bossRepo';
import type { RaidService } from './modules/raids/raids.service';
import type { RaidJoinService } from './modules/raids/raidJoin.service';
import type { RaidBroadcaster } from './realtime/broadcaster';
import type { NotificationService } from './push/notification.service';

export function createApp(deps: {
  authService: AuthService;
  userService?: UserService;
  characterService?: CharacterService;
  progressionService?: ProgressionService;
  bossRepo?: BossRepo;
  raidService?: RaidService;
  raidJoinService?: RaidJoinService;
  broadcaster?: RaidBroadcaster;
  notificationService?: NotificationService;
}): Express {
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
  if (deps.userService) app.use('/', createUsersRouter(deps.userService));
  if (deps.bossRepo) app.use('/', createReferenceRouter(deps.bossRepo));
  if (deps.characterService && deps.progressionService) {
    app.use('/', createCharactersRouter(deps.characterService, deps.progressionService));
    app.use('/', createProgressionRouter(deps.progressionService));
  }
  if (deps.raidService && deps.raidJoinService) {
    app.use('/', createRaidsRouter(deps.raidService, deps.raidJoinService, deps.broadcaster, deps.notificationService));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
