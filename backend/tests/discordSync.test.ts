import { createDiscordSyncCore } from '../src/discord/discordSync';
import { makeFakeGuildConfigRepo, makeFakeRaidDiscordMessageRepo } from './fakes/fakeRepos';
import { makeFakeGateway } from './fakes/fakeDiscord';

const detail = (over: any = {}) => ({ id: 7, codigo: 'X7', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z'), status: 'OPEN', created_by: 1, roster: [], ...over } as any);

async function setup(opts: { failChannels?: string[] } = {}) {
  const guildConfigRepo = makeFakeGuildConfigRepo();
  const msgRepo = makeFakeRaidDiscordMessageRepo();
  const gateway = makeFakeGateway(opts);
  await guildConfigRepo.upsert('g1', 'c1');
  await guildConfigRepo.upsert('g2', 'c2');
  const core = createDiscordSyncCore({ gateway, guildConfigRepo, msgRepo, appPublicUrl: 'https://holoraid.fun' });
  return { core, gateway, msgRepo };
}

describe('DiscordSync', () => {
  it('onCreated posta em cada servidor e grava as refs', async () => {
    const { core, gateway, msgRepo } = await setup();
    await core.onCreated(detail());
    expect(gateway.calls.filter((c) => c.kind === 'post')).toHaveLength(2);
    expect(await msgRepo.listByRaid(7)).toHaveLength(2);
  });

  it('onUpdated edita cada mensagem; raidFull também posta a mensagem "full"', async () => {
    const { core, gateway, msgRepo } = await setup();
    await core.onCreated(detail());
    await core.onUpdated(detail({ roster: [{ status: 'confirmed', role: 'DPS' }] }), 'playerJoined');
    expect(gateway.calls.filter((c) => c.kind === 'edit')).toHaveLength(2);
    expect(gateway.calls.filter((c) => c.kind === 'message')).toHaveLength(0);
    await core.onUpdated(detail(), 'raidFull');
    expect(gateway.calls.filter((c) => c.kind === 'message')).toHaveLength(2);
    expect(await msgRepo.listByRaid(7)).toHaveLength(2); // não duplica
  });

  it('onRemoved apaga as mensagens e limpa as refs', async () => {
    const { core, gateway, msgRepo } = await setup();
    await core.onCreated(detail());
    await core.onRemoved(7);
    expect(gateway.calls.filter((c) => c.kind === 'delete')).toHaveLength(2);
    expect(await msgRepo.listByRaid(7)).toHaveLength(0);
  });

  it('best-effort: um servidor falhando não impede os outros', async () => {
    const { core, msgRepo } = await setup({ failChannels: ['c1'] });
    await core.onCreated(detail());
    const refs = await msgRepo.listByRaid(7);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.channel_id).toBe('c2');
  });
});
