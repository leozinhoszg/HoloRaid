import { runStartingSoonTick } from '../src/push/scheduler';
import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo, makeFakeDeviceTokenRepo } from './fakes/fakeRepos';
import { makeFakePushGateway } from './fakes/fakePush';
import { createNotificationService } from '../src/push/notification.service';
import { createRaidService } from '../src/modules/raids/raids.service';

const raidInput = (startAt: Date) => ({
  operation: 'Dread Palace', difficulty: 'HM' as const, size: 8, faction: 'Republic' as const,
  minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4,
  notes: null, start_at: startAt,
});

async function setup() {
  const raidRepo = makeFakeRaidRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const userRepo = makeFakeUserRepo();
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const gateway = makeFakePushGateway();
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const notify = createNotificationService({ gateway, deviceTokenRepo, userRepo });
  return { raidRepo, raidService, notify, gateway, deps: { raidRepo, raidService, notify } };
}

describe('runStartingSoonTick', () => {
  it('raid dentro da janela → notifica uma vez; 2º tick não re-envia', async () => {
    const { raidService, deps } = await setup();
    await raidService.create({ sub: 1, role: 'user' }, raidInput(new Date(Date.now() + 10 * 60_000)));

    expect(await runStartingSoonTick(deps)).toBe(1);
    expect(await runStartingSoonTick(deps)).toBe(0); // idempotente
  });

  it('raid fora da janela (2h) → ignorada', async () => {
    const { raidService, deps } = await setup();
    await raidService.create({ sub: 1, role: 'user' }, raidInput(new Date(Date.now() + 120 * 60_000)));
    expect(await runStartingSoonTick(deps)).toBe(0);
  });

  it('raid no passado → ignorada', async () => {
    const { raidService, deps } = await setup();
    await raidService.create({ sub: 1, role: 'user' }, raidInput(new Date(Date.now() - 5 * 60_000)));
    expect(await runStartingSoonTick(deps)).toBe(0);
  });

  it('raid não-OPEN → ignorada', async () => {
    const { raidService, deps } = await setup();
    const r = await raidService.create({ sub: 1, role: 'user' }, raidInput(new Date(Date.now() + 10 * 60_000)));
    await raidService.transition({ sub: 1, role: 'user' }, r.id, 'cancel');
    expect(await runStartingSoonTick(deps)).toBe(0);
  });
});
