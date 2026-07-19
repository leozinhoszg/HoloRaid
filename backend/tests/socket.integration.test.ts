import http from 'node:http';
import request from 'supertest';
import { Server } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../src/app';
import { registerSocket } from '../src/realtime/socketServer';
import { createRaidBroadcaster } from '../src/realtime/broadcaster';
import { verifyAccessToken, signAccessToken } from '../src/common/security/jwt';
import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C';
  process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

async function boot() {
  const raidRepo = makeFakeRaidRepo();
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo, userRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo, userRepo });

  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: true } });
  registerSocket(io, { verify: verifyAccessToken });
  const broadcaster = createRaidBroadcaster(io);
  const app = createApp({ authService: {} as any, raidService, raidJoinService, broadcaster });
  httpServer.on('request', app);
  await new Promise<void>((r) => httpServer.listen(0, r));
  const port = (httpServer.address() as any).port as number;
  return { app, io, httpServer, port, raidService, personagemRepo };
}

const tok = (sub: number, role: 'user' | 'admin' = 'user') => signAccessToken({ sub, role });

function connect(port: number, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const c = ioClient(`http://localhost:${port}`, { transports: ['websocket'], auth: token ? { token } : {}, reconnection: false });
    c.on('connect', () => resolve(c));
    c.on('connect_error', (e) => reject(e));
  });
}

const baseRaid = () => ({
  operation: 'Dread Palace', difficulty: 'HM' as const, size: 8, faction: 'Republic' as const, minimum_tier: 0,
  check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z'),
});

describe('socket integração', () => {
  it('recusa conexão sem token', async () => {
    const { io, httpServer, port } = await boot();
    await expect(connect(port)).rejects.toBeTruthy();
    io.close(); httpServer.close();
  });

  it('inscrito em raid:{id} recebe playerJoined ao dar join via REST', async () => {
    const ctx = await boot();
    const raid = await ctx.raidService.create({ sub: 1, role: 'user' }, baseRaid());
    const p = await ctx.personagemRepo.create({ usuario_id: 5, nome: 'Ok', faccao: 'Republic', classe: 'Sentinel', especializacao: null, role: 'DPS', origin_story: null, item_level: 330 });

    const client = await connect(ctx.port, tok(5));
    await client.emitWithAck('subscribe:raid', { id: raid.id });
    const got = new Promise<any>((resolve) => client.once('playerJoined', resolve));

    await request(ctx.app).post(`/raids/${raid.id}/join`).set('Authorization', `Bearer ${tok(5)}`).send({ personagem_id: p.id });

    const payload = await got;
    expect(payload.raid.id).toBe(raid.id);
    expect(payload.raid.roster).toHaveLength(1);

    client.close(); ctx.io.close(); ctx.httpServer.close();
  });

  it('não recebe evento de outra raid', async () => {
    const ctx = await boot();
    const raidA = await ctx.raidService.create({ sub: 1, role: 'user' }, baseRaid());
    const raidB = await ctx.raidService.create({ sub: 1, role: 'user' }, baseRaid());
    const p = await ctx.personagemRepo.create({ usuario_id: 5, nome: 'Ok', faccao: 'Republic', classe: 'Sentinel', especializacao: null, role: 'DPS', origin_story: null, item_level: 330 });

    const client = await connect(ctx.port, tok(5));
    await client.emitWithAck('subscribe:raid', { id: raidA.id });
    let leaked = false;
    client.on('playerJoined', () => { leaked = true; });

    await request(ctx.app).post(`/raids/${raidB.id}/join`).set('Authorization', `Bearer ${tok(5)}`).send({ personagem_id: p.id });
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toBe(false);

    client.close(); ctx.io.close(); ctx.httpServer.close();
  });
});
