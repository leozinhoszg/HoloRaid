import { createNotificationService } from '../src/push/notification.service';
import { makeFakeUserRepo, makeFakeDeviceTokenRepo } from './fakes/fakeRepos';
import { makeFakePushGateway } from './fakes/fakePush';
import { makeFakeDmGateway } from './fakes/fakeDm';

const detail = (roster: { usuario_id: number; status: string }[] = []) => ({
  id: 7, codigo: 'X7', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic',
  minimum_tier: 0, check_composition: false, disable_mentions: false, slots_tank: 2, slots_heal: 2, slots_dps: 4,
  notes: null, start_at: new Date('2026-08-01T20:30:00Z'), status: 'OPEN', created_by: 1,
  roster: roster.map((r) => ({ ...r, role: 'DPS' })),
} as any);

async function setup(gwOpts: { invalidTokens?: string[]; fail?: boolean } = {}) {
  const userRepo = makeFakeUserRepo();
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const gateway = makeFakePushGateway(gwOpts);
  const mk = async (discord_id: string) =>
    userRepo.upsertByDiscordId({ discord_id, username: discord_id, nickname: null, avatar: null, email: null, role: 'user' });
  const notify = createNotificationService({ gateway, deviceTokenRepo, userRepo });
  return { notify, gateway, userRepo, deviceTokenRepo, mk };
}

async function setupDm(dmOpts: { fail?: boolean; failFor?: string[] } = {}) {
  const userRepo = makeFakeUserRepo();
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const gateway = makeFakePushGateway();
  const dmGateway = makeFakeDmGateway(dmOpts);
  const mk = async (discord_id: string) =>
    userRepo.upsertByDiscordId({ discord_id, username: discord_id, nickname: null, avatar: null, email: null, role: 'user' });
  const notify = createNotificationService({ gateway, dmGateway, deviceTokenRepo, userRepo });
  return { notify, gateway, dmGateway, userRepo, deviceTokenRepo, mk };
}

describe('NotificationService', () => {
  it('slotConfirmed envia só para os tokens do promovido', async () => {
    const { notify, gateway, deviceTokenRepo, mk } = await setup();
    const a = await mk('a'); const b = await mk('b');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await deviceTokenRepo.upsert(b.id, 'tok-b', 'android');

    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }, { usuario_id: b.id, status: 'waitlist' }]));

    expect(gateway.sends).toHaveLength(1);
    expect(gateway.sends[0]!.tokens).toEqual(['tok-a']);
    expect(gateway.sends[0]!.msg.title).toBe("You're in!");
  });

  it('push_enabled=false não recebe nada', async () => {
    const { notify, gateway, userRepo, deviceTokenRepo, mk } = await setup();
    const a = await mk('a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await userRepo.setPushEnabled(a.id, false);

    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]));
    expect(gateway.sends).toHaveLength(0);
  });

  it('usuário sem token → nenhum envio, sem erro', async () => {
    const { notify, gateway, mk } = await setup();
    const a = await mk('a');
    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]));
    expect(gateway.sends).toHaveLength(0);
  });

  it('raidCancelled envia para todo o roster (confirmados + waitlist), sem duplicar tokens', async () => {
    const { notify, gateway, deviceTokenRepo, mk } = await setup();
    const a = await mk('a'); const b = await mk('b');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await deviceTokenRepo.upsert(b.id, 'tok-b', 'web');

    await notify.raidCancelled(detail([{ usuario_id: a.id, status: 'confirmed' }, { usuario_id: b.id, status: 'waitlist' }]));

    expect(gateway.sends).toHaveLength(1);
    expect(gateway.sends[0]!.tokens.sort()).toEqual(['tok-a', 'tok-b']);
    expect(gateway.sends[0]!.msg.title).toBe('Raid cancelled');
  });

  it('tokens inválidos retornados pelo gateway são apagados', async () => {
    const { notify, deviceTokenRepo, mk } = await setup({ invalidTokens: ['tok-a'] });
    const a = await mk('a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await deviceTokenRepo.upsert(a.id, 'tok-ok', 'web');

    await notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]));

    const restantes = (await deviceTokenRepo.listByUsuarios([a.id])).map((t) => t.token);
    expect(restantes).toEqual(['tok-ok']);
  });

  it('gateway lançando não propaga (best-effort)', async () => {
    const { notify, deviceTokenRepo, mk } = await setup({ fail: true });
    const a = await mk('a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await expect(notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]))).resolves.toBeUndefined();
  });

  it('raidStarting menciona 30 minutos', async () => {
    const { notify, gateway, deviceTokenRepo, mk } = await setup();
    const a = await mk('a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]));
    expect(gateway.sends[0]!.msg.body).toContain('30 minutes');
  });
});

describe('fallback por DM (#6b)', () => {
  it('usuário SEM token → recebe DM, e nenhum push', async () => {
    const { notify, gateway, dmGateway, mk } = await setupDm();
    const a = await mk('disc-a');
    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]));

    expect(gateway.sends).toHaveLength(0);
    expect(dmGateway.sends).toHaveLength(1);
    expect(dmGateway.sends[0]!.discordIds).toEqual(['disc-a']);
    expect(dmGateway.sends[0]!.msg.title).toBe("You're in!");
  });

  it('usuário COM token → recebe push, e nenhuma DM', async () => {
    const { notify, gateway, dmGateway, deviceTokenRepo, mk } = await setupDm();
    const a = await mk('disc-a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]));

    expect(gateway.sends).toHaveLength(1);
    expect(dmGateway.sends).toHaveLength(0);
  });

  it('roster misto → 1 push + 1 DM, sem sobreposição', async () => {
    const { notify, gateway, dmGateway, deviceTokenRepo, mk } = await setupDm();
    const comApp = await mk('disc-app');
    const semApp = await mk('disc-dm');
    await deviceTokenRepo.upsert(comApp.id, 'tok-app', 'android');

    await notify.raidCancelled(detail([
      { usuario_id: comApp.id, status: 'confirmed' },
      { usuario_id: semApp.id, status: 'waitlist' },
    ]));

    expect(gateway.sends).toHaveLength(1);
    expect(gateway.sends[0]!.tokens).toEqual(['tok-app']);
    expect(dmGateway.sends).toHaveLength(1);
    expect(dmGateway.sends[0]!.discordIds).toEqual(['disc-dm']);
  });

  it('push_enabled=false → silêncio nos dois canais', async () => {
    const { notify, gateway, dmGateway, userRepo, mk } = await setupDm();
    const a = await mk('disc-a');
    await userRepo.setPushEnabled(a.id, false);
    await notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]));

    expect(gateway.sends).toHaveLength(0);
    expect(dmGateway.sends).toHaveLength(0);
  });

  it('dmGateway lançando não propaga (best-effort)', async () => {
    const { notify, mk } = await setupDm({ fail: true });
    const a = await mk('disc-a');
    await expect(notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]))).resolves.toBeUndefined();
  });

  it('sem dmGateway (default no-op) → nada acontece, sem erro', async () => {
    const { notify, gateway, mk } = await setup();
    const a = await mk('a');
    await expect(notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]))).resolves.toBeUndefined();
    expect(gateway.sends).toHaveLength(0);
  });
});
