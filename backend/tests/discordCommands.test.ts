import { handleCreateRaid, handleSetRaidChannel, type CommandInteraction } from '../src/discord/commands';
import { makeFakeGuildConfigRepo, makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

function deps() {
  const guildConfigRepo = makeFakeGuildConfigRepo();
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidRepo = makeFakeRaidRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const created: string[] = [];
  const bus: RaidBroadcaster = { raidCreated: () => created.push('created'), raidUpdated: () => {}, raidRemoved: () => {} };
  return { d: { raidService, userRepo, guildConfigRepo, bus }, guildConfigRepo, raidRepo, created };
}

function fakeInteraction(over: Partial<CommandInteraction> & { opts?: Record<string, any> } = {}): CommandInteraction & { replies: any[] } {
  const replies: any[] = [];
  const opts = over.opts ?? {};
  return {
    user: over.user ?? { id: 'd123', username: 'diego' },
    guildId: over.guildId ?? 'g1',
    channelId: over.channelId ?? 'c1',
    memberPermissions: over.memberPermissions ?? { has: () => true },
    getString: (n) => (opts[n] ?? null),
    getInteger: (n) => (opts[n] ?? null),
    getBoolean: (n) => (opts[n] ?? null),
    reply: async (m) => { replies.push(m); },
    replies,
  };
}

describe('/set_raid_channel', () => {
  it('sem Manage Guild recusa', async () => {
    const { d } = deps();
    const i = fakeInteraction({ memberPermissions: { has: () => false } });
    await handleSetRaidChannel(i, d);
    expect(i.replies[0].content).toMatch(/Manage Server/);
    expect(await d.guildConfigRepo.findByGuild('g1')).toBeNull();
  });
  it('com permissão grava o canal', async () => {
    const { d } = deps();
    const i = fakeInteraction({ guildId: 'g1', channelId: 'c9' });
    await handleSetRaidChannel(i, d);
    expect((await d.guildConfigRepo.findByGuild('g1'))!.raid_channel_id).toBe('c9');
  });
});

describe('/create_raid', () => {
  const goodOpts = { operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, date: '2026-08-01', time: '20:30' };
  it('cria a raid, auto-cria o usuário e emite no bus', async () => {
    const { d, raidRepo, created } = deps();
    const i = fakeInteraction({ opts: goodOpts });
    await handleCreateRaid(i, d);
    expect((await raidRepo.list({})).length).toBe(1);
    expect(created).toContain('created');
    expect(i.replies[0].content).toMatch(/created/i);
  });
  it('opções inválidas → erro efêmero, sem criar', async () => {
    const { d, raidRepo } = deps();
    const i = fakeInteraction({ opts: { ...goodOpts, operation: 'Inexistente' } });
    await handleCreateRaid(i, d);
    expect((await raidRepo.list({})).length).toBe(0);
    expect(i.replies[0].ephemeral).toBe(true);
  });
});
