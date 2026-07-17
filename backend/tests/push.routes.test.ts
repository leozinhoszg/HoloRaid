import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeDeviceTokenRepo } from './fakes/fakeRepos';
import { makeFakePushGateway } from './fakes/fakePush';
import { createNotificationService } from '../src/push/notification.service';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

async function setup() {
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidRepo = makeFakeRaidRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const gateway = makeFakePushGateway();
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo });
  const notify = createNotificationService({ gateway, deviceTokenRepo, userRepo });
  const app = createApp({ authService: {} as any, raidService, raidJoinService, notificationService: notify });
  return { app, gateway, userRepo, deviceTokenRepo, personagemRepo, raidService, raidJoinService };
}
const tok = (id: number) => signAccessToken({ sub: id, role: 'user' });

describe('push no ciclo de raid (#6)', () => {
  it('cancelar a raid notifica o roster', async () => {
    const { app, gateway, userRepo, deviceTokenRepo, personagemRepo, raidService, raidJoinService } = await setup();
    const leader = await userRepo.upsertByDiscordId({ discord_id: 'l', username: 'l', nickname: null, avatar: null, email: null, role: 'user' });
    const p = await personagemRepo.create({ usuario_id: leader.id, nome: 'C', faccao: 'Republic', classe: 'Guardian', especializacao: 'Vigilance', role: 'DPS', origin_story: null, item_level: 330 } as any);
    await deviceTokenRepo.upsert(leader.id, 'tok-l', 'android');

    const raid = await raidService.create({ sub: leader.id, role: 'user' }, { operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z') } as any);
    await raidJoinService.join(leader.id, raid.id, p.id);

    const res = await request(app).post(`/raids/${raid.id}/cancel`).set('Authorization', `Bearer ${tok(leader.id)}`);
    expect(res.status).toBe(200);
    expect(gateway.sends).toHaveLength(1);
    expect(gateway.sends[0]!.msg.title).toBe('Raid cancelled');
    expect(gateway.sends[0]!.tokens).toEqual(['tok-l']);
  });
});
