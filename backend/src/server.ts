import http from 'node:http';
import { Server } from 'socket.io';
import { getConfig } from './config';
import { createDb } from './db/db';
import { createUserRepo } from './db/repositories/userRepo';
import { createRefreshTokenRepo } from './db/repositories/refreshTokenRepo';
import { createAuditLog } from './db/repositories/auditRepo';
import { createAuthService } from './modules/auth/auth.service';
import { createUserService } from './modules/users/users.service';
import { createPersonagemRepo } from './db/repositories/personagemRepo';
import { createBossRepo } from './db/repositories/bossRepo';
import { createCharacterBossRepo } from './db/repositories/characterBossRepo';
import { createCharacterService } from './modules/characters/characters.service';
import { createProgressionService } from './modules/progression/progression.service';
import { createRaidRepo } from './db/repositories/raidRepo';
import { createRaidPlayerRepo } from './db/repositories/raidPlayerRepo';
import { createRaidService } from './modules/raids/raids.service';
import { createRaidJoinService } from './modules/raids/raidJoin.service';
import { registerSocket } from './realtime/socketServer';
import { createRaidBroadcaster } from './realtime/broadcaster';
import { verifyAccessToken } from './common/security/jwt';
import { createApp } from './app';
import { logger } from './common/logger/logger';

const cfg = getConfig(); // fail-fast
const db = createDb();

const userRepo = createUserRepo(db);
const refreshRepo = createRefreshTokenRepo(db);
const authService = createAuthService({
  userRepo, refreshRepo,
  config: { ADMIN_DISCORD_IDS: cfg.ADMIN_DISCORD_IDS, REFRESH_TOKEN_TTL_DAYS: cfg.REFRESH_TOKEN_TTL_DAYS },
});
const userService = createUserService({ userRepo, auditLog: createAuditLog(db) });

const personagemRepo = createPersonagemRepo(db);
const bossRepo = createBossRepo(db);
const charBossRepo = createCharacterBossRepo(db);
const characterService = createCharacterService({ personagemRepo });
const progressionService = createProgressionService({ personagemRepo, bossRepo, charBossRepo });

const raidRepo = createRaidRepo(db);
const raidPlayerRepo = createRaidPlayerRepo(db);
const raidService = createRaidService({ raidRepo, raidPlayerRepo });
const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo });

// Socket.IO no mesmo http.Server (sem app ainda, p/ quebrar o ciclo io↔broadcaster↔app)
const httpServer = http.createServer();
const io = new Server(httpServer, {
  cors: { origin: cfg.CORS_ORIGINS.length ? cfg.CORS_ORIGINS : false, credentials: true },
});
registerSocket(io, { verify: verifyAccessToken });
const broadcaster = createRaidBroadcaster(io);

const app = createApp({ authService, userService, characterService, progressionService, bossRepo, raidService, raidJoinService, broadcaster });
httpServer.on('request', app);
httpServer.listen(cfg.PORT, () => logger.info(`RaidSync backend (HTTP+Socket.IO) ouvindo em :${cfg.PORT}`));
