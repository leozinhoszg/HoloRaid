import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C';
  process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

function build() {
  const raidRepo = makeFakeRaidRepo();
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo, userRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo, userRepo });
  const events: string[] = [];
  const broadcaster: RaidBroadcaster = {
    raidCreated: () => events.push('created'),
    raidUpdated: (_d, e) => events.push(e),
    raidRemoved: () => events.push('removed'),
  };
  const app = createApp({ authService: {} as any, raidService, raidJoinService, broadcaster });
  return { app, raidService, personagemRepo, events };
}
const tok = (sub: number) => signAccessToken({ sub, role: 'user' });

describe('raidFull', () => {
  it('o join que enche dispara raidUpdated(raidFull)', async () => {
    const { app, raidService, personagemRepo, events } = build();
    const raid = await raidService.create({ sub: 1, role: 'user' }, {
      operation: 'Dread Palace', difficulty: 'HM', size: 2, faction: 'Republic', minimum_tier: 0,
      check_composition: false, slots_tank: 1, slots_heal: 0, slots_dps: 1, notes: null, start_at: new Date('2026-08-01T20:30:00Z'),
    });
    const mk = (uid: number) => personagemRepo.create({ usuario_id: uid, nome: 'P' + uid, faccao: 'Republic', classe: 'Sentinel', especializacao: null, role: 'DPS', origin_story: null, item_level: 330 });
    const p1 = await mk(10); const p2 = await mk(11);
    await request(app).post(`/raids/${raid.id}/join`).set('Authorization', `Bearer ${tok(10)}`).send({ personagem_id: p1.id });
    expect(events).not.toContain('raidFull');
    await request(app).post(`/raids/${raid.id}/join`).set('Authorization', `Bearer ${tok(11)}`).send({ personagem_id: p2.id });
    expect(events).toContain('raidFull');
  });
});
