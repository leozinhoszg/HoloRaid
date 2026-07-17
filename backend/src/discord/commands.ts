import { raidCreateSchema, raidUpdateSchema } from '../modules/raids/raids.schemas';
import { defaultSlots } from '../modules/raids/raids.util';
import type { RaidService, RaidDetail } from '../modules/raids/raids.service';
import type { UserRepo } from '../db/repositories/userRepo';
import type { GuildConfigRepo } from '../db/repositories/guildConfigRepo';
import type { RaidBroadcaster } from '../realtime/broadcaster';
import { AppError } from '../common/errors/AppError';

export interface CommandInteraction {
  user: { id: string; username: string };
  guildId: string | null;
  channelId: string;
  memberPermissions: { has(perm: string): boolean } | null;
  getString(name: string): string | null;
  getInteger(name: string): number | null;
  getBoolean(name: string): boolean | null;
  reply(m: { content: string; ephemeral?: boolean }): Promise<void>;
}

export type CommandDeps = {
  raidService: RaidService;
  userRepo: UserRepo;
  guildConfigRepo: GuildConfigRepo;
  bus: RaidBroadcaster;
  report?: (detail: RaidDetail, guildId: string, channelId: string) => Promise<'posted' | 'exists' | 'failed'>;
};

export async function handleSetRaidChannel(i: CommandInteraction, deps: CommandDeps): Promise<void> {
  if (!i.guildId) { await i.reply({ content: 'Use this command in a server.', ephemeral: true }); return; }
  if (!i.memberPermissions?.has('ManageGuild')) {
    await i.reply({ content: 'You need the **Manage Server** permission to do this.', ephemeral: true });
    return;
  }
  await deps.guildConfigRepo.upsert(i.guildId, i.channelId);
  await i.reply({ content: 'Raid announcements will be posted in this channel. ✅', ephemeral: true });
}

function parseStartAt(date: string | null, time: string | null): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  const t = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (!d || !t) return null;
  const dt = new Date(Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +t[1]!, +t[2]!));
  return isNaN(dt.getTime()) ? null : dt;
}

export async function handleCreateRaid(i: CommandInteraction, deps: CommandDeps): Promise<void> {
  const size = i.getInteger('size') ?? 8;
  const startAt = parseStartAt(i.getString('date'), i.getString('time'));
  if (!startAt) { await i.reply({ content: 'Invalid date/time. Use date `YYYY-MM-DD` and time `HH:MM` (UTC).', ephemeral: true }); return; }

  const input = {
    operation: i.getString('operation'),
    difficulty: i.getString('difficulty'),
    size,
    faction: i.getString('faction'),
    minimum_tier: i.getInteger('minimum_tier') ?? 0,
    check_composition: i.getBoolean('check_composition') ?? false,
    disable_mentions: i.getBoolean('disable_mentions') ?? false,
    ...defaultSlots(size),
    notes: i.getString('notes') ?? null,
    start_at: startAt,
  };

  const parsed = raidCreateSchema.safeParse(input);
  if (!parsed.success) { await i.reply({ content: 'Invalid options. Check operation/difficulty/size/faction.', ephemeral: true }); return; }

  const user = await deps.userRepo.upsertByDiscordId({ discord_id: i.user.id, username: i.user.username, nickname: null, avatar: null, email: null, role: 'user' });
  const detail = await deps.raidService.create({ sub: user.id, role: user.role }, { ...parsed.data, notes: parsed.data.notes ?? null });
  deps.bus.raidCreated(detail);
  await i.reply({ content: `Raid created: **${detail.operation}** (${detail.codigo}). It will be posted in configured channels.`, ephemeral: true });
}

export async function handleReportRaid(i: CommandInteraction, deps: CommandDeps): Promise<void> {
  const code = i.getString('code');
  if (!code) { await i.reply({ content: 'Provide the raid code.', ephemeral: true }); return; }
  if (!i.guildId) { await i.reply({ content: 'Use this command in a server.', ephemeral: true }); return; }
  if (!deps.report) { await i.reply({ content: 'Reporting is unavailable.', ephemeral: true }); return; }

  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  if (detail.status !== 'OPEN') { await i.reply({ content: "This raid isn't open for sign-ups.", ephemeral: true }); return; }

  const result = await deps.report(detail, i.guildId, i.channelId);
  const msg = result === 'posted' ? 'Raid reported in this channel. ✅'
    : result === 'exists' ? 'This raid is already posted in this channel.'
      : "Couldn't post here — check my permissions.";
  await i.reply({ content: msg, ephemeral: true });
}

function mapUpdateError(err: unknown): string {
  if (err instanceof AppError) {
    switch (err.statusCode) {
      case 403: return 'You can only edit your own raids.';
      case 404: return 'Raid not found.';
      case 409: return 'This raid can no longer be edited.';
      case 422: return 'Invalid values. Check the fields.';
    }
  }
  return 'Something went wrong.';
}

export async function handleEditRaid(i: CommandInteraction, deps: CommandDeps): Promise<void> {
  const code = i.getString('code');
  if (!code) { await i.reply({ content: 'Provide the raid code.', ephemeral: true }); return; }

  let current: RaidDetail;
  try { current = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  const patch: Record<string, unknown> = {};
  const minTier = i.getInteger('minimum_tier'); if (minTier !== null) patch.minimum_tier = minTier;
  const notes = i.getString('notes'); if (notes !== null) patch.notes = notes;
  const checkComp = i.getBoolean('check_composition'); if (checkComp !== null) patch.check_composition = checkComp;
  const st = i.getInteger('slots_tank'); if (st !== null) patch.slots_tank = st;
  const sh = i.getInteger('slots_heal'); if (sh !== null) patch.slots_heal = sh;
  const sd = i.getInteger('slots_dps'); if (sd !== null) patch.slots_dps = sd;

  const date = i.getString('date');
  const time = i.getString('time');
  if (date !== null || time !== null) {
    const startAt = parseStartAt(date, time);
    if (!startAt) { await i.reply({ content: 'Provide both date (YYYY-MM-DD) and time (HH:MM) in UTC.', ephemeral: true }); return; }
    patch.start_at = startAt;
  }

  if (Object.keys(patch).length === 0) { await i.reply({ content: 'Nothing to update — provide at least one field.', ephemeral: true }); return; }

  const parsed = raidUpdateSchema.safeParse(patch);
  if (!parsed.success) { await i.reply({ content: 'Invalid values. Check the fields.', ephemeral: true }); return; }

  const user = await deps.userRepo.upsertByDiscordId({ discord_id: i.user.id, username: i.user.username, nickname: null, avatar: null, email: null, role: 'user' });
  try {
    const updated = await deps.raidService.update({ sub: user.id, role: user.role }, current.id, parsed.data);
    deps.bus.raidUpdated(updated, 'raidUpdated');
    await i.reply({ content: `Raid updated: **${updated.operation}** (${updated.codigo}).`, ephemeral: true });
  } catch (err) {
    await i.reply({ content: mapUpdateError(err), ephemeral: true });
  }
}
