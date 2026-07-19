import { handleJoinClick, handleCharacterPick, handleLeaveClick, type ComponentInteraction, type ComponentDeps } from '../src/discord/components';
import { makeFakeUserRepo, makeFakePersonagemRepo, makeFakeRaidRepo, makeFakeRaidPlayerRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';

function deps() {
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidRepo = makeFakeRaidRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo, userRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo, userRepo });
  const events: string[] = [];
  const bus: RaidBroadcaster = { raidCreated: () => {}, raidUpdated: (_d, e) => events.push(e), raidRemoved: () => {} };
  const d: ComponentDeps = { raidService, userRepo, personagemRepo, raidJoinService, bus, appPublicUrl: 'https://holoraid.fun' };
  return { d, events };
}

function fakeInteraction(over: { user?: { id: string; username: string }; customId: string; values?: string[] }): ComponentInteraction & { replies: any[]; selects: any[] } {
  const replies: any[] = [];
  const selects: any[] = [];
  return {
    user: over.user ?? { id: 'd1', username: 'diego' },
    guildId: 'g1', channelId: 'c1',
    customId: over.customId,
    values: over.values ?? [],
    reply: async (m) => { replies.push(m); },
    replySelect: async (m) => { selects.push(m); },
    replies, selects,
  };
}

async function seedRaid(d: ComponentDeps, over: Record<string, any> = {}) {
  const leader = await d.userRepo.upsertByDiscordId({ discord_id: 'leader', username: 'leader', nickname: null, avatar: null, email: null, role: 'user' });
  return d.raidService.create({ sub: leader.id, role: 'user' }, {
    operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0,
    check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null,
    start_at: new Date('2026-08-01T20:30:00Z'), ...over,
  } as any);
}

async function giveChar(d: ComponentDeps, discordId: string, over: Record<string, any> = {}) {
  const u = await d.userRepo.upsertByDiscordId({ discord_id: discordId, username: discordId, nickname: null, avatar: null, email: null, role: 'user' });
  const p = await d.personagemRepo.create({ usuario_id: u.id, nome: 'Kael', faccao: 'Republic', classe: 'Sniper', especializacao: null, role: 'DPS', origin_story: null, item_level: 306, ...over } as any);
  return { u, p };
}

describe('/join (click)', () => {
  it('sem personagem → aponta para a web, sem select', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/create one/i);
    expect(i.replies[0].content).toContain('holoraid.fun');
    expect(i.selects).toHaveLength(0);
  });

  it('char de facção errada → recusa com motivo', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    await giveChar(d, 'd1', { faccao: 'Empire' });
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/Republic character/i);
    expect(i.selects).toHaveLength(0);
  });

  it('char abaixo do Tier mínimo → recusa com motivo', async () => {
    const { d } = deps();
    const raid = await seedRaid(d, { minimum_tier: 3 });
    await giveChar(d, 'd1'); // total_points 0 → Tier 0
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/Tier 3/);
    expect(i.selects).toHaveLength(0);
  });

  it('char elegível → responde com select das opções', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const { p } = await giveChar(d, 'd1');
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies).toHaveLength(0);
    expect(i.selects[0].customId).toBe(`hr:pick:${raid.codigo}`);
    expect(i.selects[0].options).toHaveLength(1);
    expect(i.selects[0].options[0].value).toBe(String(p.id));
    expect(i.selects[0].options[0].label).toMatch(/Kael/);
  });

  it('já inscrito → pede para usar Leave', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const { u, p } = await giveChar(d, 'd1');
    await d.raidJoinService.join(u.id, raid.id, p.id);
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/already signed/i);
    expect(i.selects).toHaveLength(0);
  });

  it('raid não-OPEN → recusa', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const leader = await d.userRepo.upsertByDiscordId({ discord_id: 'leader', username: 'leader', nickname: null, avatar: null, email: null, role: 'user' });
    await d.raidService.transition({ sub: leader.id, role: 'user' }, raid.id, 'cancel');
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/isn't open/i);
    expect(i.selects).toHaveLength(0);
  });
});

async function fillConfirmed(d: ComponentDeps, raidId: number, n: number) {
  for (let k = 0; k < n; k++) {
    const u = await d.userRepo.upsertByDiscordId({ discord_id: `f${k}`, username: `f${k}`, nickname: null, avatar: null, email: null, role: 'user' });
    const p = await d.personagemRepo.create({ usuario_id: u.id, nome: `F${k}`, faccao: 'Republic', classe: 'X', especializacao: null, role: 'DPS', origin_story: null, item_level: 300 } as any);
    await d.raidJoinService.join(u.id, raidId, p.id);
  }
}

describe('/pick (escolha de personagem)', () => {
  it('char elegível → inscreve confirmado e emite playerJoined', async () => {
    const { d, events } = deps();
    const raid = await seedRaid(d);
    const { p } = await giveChar(d, 'd1');
    const i = fakeInteraction({ customId: `hr:pick:${raid.codigo}`, values: [String(p.id)] });
    await handleCharacterPick(i, d);
    expect(i.replies[0].content).toMatch(/confirmed/i);
    expect(events).toContain('playerJoined');
    expect((await d.raidService.getDetail(raid.id)).roster).toHaveLength(1);
  });

  it('escolha que enche a raid → também emite raidFull', async () => {
    const { d, events } = deps();
    const raid = await seedRaid(d);
    await fillConfirmed(d, raid.id, 7);
    const { p } = await giveChar(d, 'd1');
    const i = fakeInteraction({ customId: `hr:pick:${raid.codigo}`, values: [String(p.id)] });
    await handleCharacterPick(i, d);
    expect(events).toContain('raidFull');
  });

  it('raid cheia → vai para a waitlist', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    await fillConfirmed(d, raid.id, 8);
    const { p } = await giveChar(d, 'd1');
    const i = fakeInteraction({ customId: `hr:pick:${raid.codigo}`, values: [String(p.id)] });
    await handleCharacterPick(i, d);
    expect(i.replies[0].content).toMatch(/waitlist/i);
  });
});

describe('/leave (click)', () => {
  it('inscrito → sai e emite playerLeft', async () => {
    const { d, events } = deps();
    const raid = await seedRaid(d);
    const { u, p } = await giveChar(d, 'd1');
    await d.raidJoinService.join(u.id, raid.id, p.id);
    const i = fakeInteraction({ customId: `hr:leave:${raid.codigo}` });
    await handleLeaveClick(i, d);
    expect(i.replies[0].content).toMatch(/left the raid/i);
    expect(events).toContain('playerLeft');
    expect((await d.raidService.getDetail(raid.id)).roster).toHaveLength(0);
  });

  it('não inscrito → mensagem clara', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const i = fakeInteraction({ customId: `hr:leave:${raid.codigo}` });
    await handleLeaveClick(i, d);
    expect(i.replies[0].content).toMatch(/weren't signed up/i);
  });
});
