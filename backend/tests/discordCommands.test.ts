import { handleCreateRaid, handleSetRaidChannel, handleEditRaid, handleReportRaid, type CommandInteraction } from '../src/discord/commands';
import { makeFakeGuildConfigRepo, makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

const openRaidInput = { operation: 'Dread Palace', difficulty: 'HM' as const, size: 8, faction: 'Republic' as const, minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z') };

function deps() {
  const guildConfigRepo = makeFakeGuildConfigRepo();
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidRepo = makeFakeRaidRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const created: string[] = [];
  const updated: string[] = [];
  const reportCalls: Array<[string, string]> = [];
  const bus: RaidBroadcaster = { raidCreated: () => created.push('created'), raidUpdated: (_d, e) => updated.push(e), raidRemoved: () => {} };
  const report: (detail: any, guildId: string, channelId: string) => Promise<'posted' | 'exists' | 'failed'> = async (_detail, g, c) => { reportCalls.push([g, c]); return 'posted'; };
  return { d: { raidService, userRepo, guildConfigRepo, bus, report }, guildConfigRepo, raidRepo, created, updated, reportCalls };
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

describe('/report_raid', () => {
  it('raid OPEN + canal novo → reported', async () => {
    const { d } = deps();
    const u = await d.userRepo.upsertByDiscordId({ discord_id: 'o1', username: 'o1', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: u.id, role: 'user' }, openRaidInput);
    const i = fakeInteraction({ opts: { code: raid.codigo } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/reported/i);
  });

  it('já reportada → already posted', async () => {
    const { d } = deps();
    d.report = async () => 'exists';
    const u = await d.userRepo.upsertByDiscordId({ discord_id: 'o2', username: 'o2', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: u.id, role: 'user' }, openRaidInput);
    const i = fakeInteraction({ opts: { code: raid.codigo } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/already posted/i);
  });

  it('raid não-OPEN → recusa', async () => {
    const { d } = deps();
    const u = await d.userRepo.upsertByDiscordId({ discord_id: 'o3', username: 'o3', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: u.id, role: 'user' }, openRaidInput);
    await d.raidService.transition({ sub: u.id, role: 'user' }, raid.id, 'cancel');
    const i = fakeInteraction({ opts: { code: raid.codigo } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/open for sign-ups/i);
  });

  it('report → failed → mensagem de permissão', async () => {
    const { d } = deps();
    d.report = async () => 'failed';
    const u = await d.userRepo.upsertByDiscordId({ discord_id: 'o4', username: 'o4', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: u.id, role: 'user' }, openRaidInput);
    const i = fakeInteraction({ opts: { code: raid.codigo } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/permission/i);
  });

  it('código inexistente → not found', async () => {
    const { d } = deps();
    const i = fakeInteraction({ opts: { code: 'nope' } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/not found/i);
  });
});

describe('/edit_raid', () => {
  async function ownedRaid(d: any, discordId = 'd123') {
    const owner = await d.userRepo.upsertByDiscordId({ discord_id: discordId, username: 'diego', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: owner.id, role: 'user' }, openRaidInput);
    return { owner, raid };
  }

  it('líder edita notes e emite raidUpdated', async () => {
    const { d, updated } = deps();
    const { raid } = await ownedRaid(d);
    const i = fakeInteraction({ opts: { code: raid.codigo, notes: 'bring pots' } });
    await handleEditRaid(i, d);
    expect(updated).toContain('raidUpdated');
    expect(i.replies[0].content).toMatch(/updated/i);
  });

  it('código inexistente → not found', async () => {
    const { d } = deps();
    const i = fakeInteraction({ opts: { code: 'nope' } });
    await handleEditRaid(i, d);
    expect(i.replies[0].content).toMatch(/not found/i);
  });

  it('não-líder → recusa (403)', async () => {
    const { d } = deps();
    const { raid } = await ownedRaid(d, 'owner');
    const i = fakeInteraction({ user: { id: 'intruder', username: 'intruder' }, opts: { code: raid.codigo, notes: 'hax' } });
    await handleEditRaid(i, d);
    expect(i.replies[0].content).toMatch(/your own/i);
  });

  it('raid não-OPEN → recusa (409)', async () => {
    const { d } = deps();
    const { owner, raid } = await ownedRaid(d);
    await d.raidService.transition({ sub: owner.id, role: 'user' }, raid.id, 'start');
    const i = fakeInteraction({ opts: { code: raid.codigo, notes: 'x' } });
    await handleEditRaid(i, d);
    expect(i.replies[0].content).toMatch(/no longer be edited/i);
  });

  it('date sem time → erro de validação', async () => {
    const { d } = deps();
    const { raid } = await ownedRaid(d);
    const i = fakeInteraction({ opts: { code: raid.codigo, date: '2026-09-01' } });
    await handleEditRaid(i, d);
    expect(i.replies[0].content).toMatch(/both date.*and time/i);
  });
});
