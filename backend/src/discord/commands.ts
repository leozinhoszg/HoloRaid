import { raidCreateSchema } from '../modules/raids/raids.schemas';
import { defaultSlots } from '../modules/raids/raids.util';
import type { RaidService } from '../modules/raids/raids.service';
import type { UserRepo } from '../db/repositories/userRepo';
import type { GuildConfigRepo } from '../db/repositories/guildConfigRepo';
import type { RaidBroadcaster } from '../realtime/broadcaster';

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
