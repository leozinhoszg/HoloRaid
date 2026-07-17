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
import { createGuildConfigRepo } from './db/repositories/guildConfigRepo';
import { createRaidDiscordMessageRepo } from './db/repositories/raidDiscordMessageRepo';
import { createRaidEventBus } from './realtime/eventBus';
import { noopGateway, createDiscordJsGateway } from './discord/gateway';
import { createDiscordSync } from './discord/discordSync';
import { createDiscordClient, attachBot } from './discord/bot';
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

const socketBroadcaster = createRaidBroadcaster(io);
const guildConfigRepo = createGuildConfigRepo(db);
const raidDiscordMessageRepo = createRaidDiscordMessageRepo(db);

// Bot Discord opcional: sem token, gateway no-op → DiscordSync não posta nada.
const discordClient = cfg.DISCORD_BOT_TOKEN ? createDiscordClient() : null;
const gateway = discordClient ? createDiscordJsGateway(discordClient) : noopGateway;
const discordSync = createDiscordSync({ gateway, guildConfigRepo, msgRepo: raidDiscordMessageRepo, appPublicUrl: cfg.APP_PUBLIC_URL });
const bus = createRaidEventBus(socketBroadcaster, discordSync);

const app = createApp({ authService, userService, characterService, progressionService, bossRepo, raidService, raidJoinService, broadcaster: bus });
httpServer.on('request', app);

if (discordClient && cfg.DISCORD_BOT_TOKEN) {
  attachBot(discordClient, { token: cfg.DISCORD_BOT_TOKEN, clientId: cfg.DISCORD_CLIENT_ID, raidService, userRepo, guildConfigRepo, bus, report: discordSync.reportTo, personagemRepo, raidJoinService, appPublicUrl: cfg.APP_PUBLIC_URL });
}

httpServer.listen(cfg.PORT, () => logger.info(`HoloRaid backend (HTTP+Socket.IO${discordClient ? '+Discord' : ''}) ouvindo em :${cfg.PORT}`));
