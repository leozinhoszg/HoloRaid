import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

function setup() {
  const raidRepo = makeFakeRaidRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const svc = createRaidService({ raidRepo, raidPlayerRepo });
  return { svc, raidRepo };
}
const admin = { sub: 9, role: 'admin' as const };
const user1 = { sub: 1, role: 'user' as const };
const baseInput = { operation: 'Dread Palace', difficulty: 'HM' as const, size: 8, faction: 'Republic' as const, minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z') };

describe('RaidService', () => {
  it('cria raid com código e status OPEN', async () => {
    const { svc } = setup();
    const r = await svc.create(user1, baseInput);
    expect(r.status).toBe('OPEN');
    expect(r.codigo).toHaveLength(8);
    expect(r.created_by).toBe(1);
    expect(r.roster).toEqual([]);
  });

  it('só líder ou admin edita/transiciona', async () => {
    const { svc } = setup();
    const r = await svc.create(user1, baseInput);
    await expect(svc.transition({ sub: 2, role: 'user' }, r.id, 'start')).rejects.toThrow();
    const started = await svc.transition(user1, r.id, 'start');
    expect(started.status).toBe('RUNNING');
  });

  it('transições guardadas: não cancela uma FINISHED', async () => {
    const { svc } = setup();
    const r = await svc.create(user1, baseInput);
    await svc.transition(user1, r.id, 'finish');
    await expect(svc.transition(user1, r.id, 'cancel')).rejects.toThrow();
  });

  it('duplicar cria nova OPEN com novo código', async () => {
    const { svc } = setup();
    const r = await svc.create(user1, baseInput);
    await svc.transition(user1, r.id, 'finish');
    const dup = await svc.duplicate(admin, r.id);
    expect(dup.status).toBe('OPEN');
    expect(dup.codigo).not.toBe(r.codigo);
    expect(dup.created_by).toBe(9);
  });

  it('getByCodigo resolve a raid', async () => {
    const { svc } = setup();
    const r = await svc.create(user1, baseInput);
    expect((await svc.getByCodigo(r.codigo)).id).toBe(r.id);
  });
});
