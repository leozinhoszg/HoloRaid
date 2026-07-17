import type { RaidService, RaidDetail } from '../modules/raids/raids.service';
import { isRaidFull } from '../modules/raids/raids.service';
import type { RaidJoinService } from '../modules/raids/raidJoin.service';
import type { UserRepo } from '../db/repositories/userRepo';
import type { PersonagemRepo } from '../db/repositories/personagemRepo';
import type { RaidBroadcaster } from '../realtime/broadcaster';
import { calcularTier } from '../common/progression/tier';
import { AppError } from '../common/errors/AppError';

export interface ComponentInteraction {
  user: { id: string; username: string };
  guildId: string | null;
  channelId: string;
  customId: string;
  values: string[];
  reply(m: { content: string; ephemeral?: boolean }): Promise<void>;
  replySelect(m: { customId: string; placeholder: string; options: { label: string; value: string }[] }): Promise<void>;
}

export type ComponentDeps = {
  raidService: RaidService;
  userRepo: UserRepo;
  personagemRepo: PersonagemRepo;
  raidJoinService: RaidJoinService;
  bus: RaidBroadcaster;
  appPublicUrl: string;
};

export function codeFromCustomId(customId: string): string {
  return customId.slice(customId.lastIndexOf(':') + 1);
}

async function actorFor(i: ComponentInteraction, deps: ComponentDeps) {
  return deps.userRepo.upsertByDiscordId({ discord_id: i.user.id, username: i.user.username, nickname: null, avatar: null, email: null, role: 'user' });
}

export async function handleJoinClick(i: ComponentInteraction, deps: ComponentDeps): Promise<void> {
  const code = codeFromCustomId(i.customId);
  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }
  if (detail.status !== 'OPEN') { await i.reply({ content: "This raid isn't open for sign-ups.", ephemeral: true }); return; }

  const user = await actorFor(i, deps);
  if (detail.roster.some((r) => r.usuario_id === user.id)) {
    await i.reply({ content: "You're already signed up. Use **Leave** to withdraw.", ephemeral: true });
    return;
  }

  const chars = await deps.personagemRepo.findByUsuario(user.id);
  const eligible = chars.filter((c) => c.faccao === detail.faction && calcularTier(c.total_points) >= detail.minimum_tier);
  if (eligible.length === 0) {
    const reason = chars.length === 0
      ? `You don't have a character yet — create one at ${deps.appPublicUrl}`
      : `You need a ${detail.faction} character${detail.minimum_tier > 0 ? ` at Tier ${detail.minimum_tier} or higher` : ''}. Manage your characters at ${deps.appPublicUrl}`;
    await i.reply({ content: reason, ephemeral: true });
    return;
  }

  await i.replySelect({
    customId: `hr:pick:${code}`,
    placeholder: 'Pick a character',
    options: eligible.map((c) => ({
      label: `${c.nome} — ${c.role} (${c.faccao}, Tier ${calcularTier(c.total_points)})`,
      value: String(c.id),
    })),
  });
}

export async function handleCharacterPick(i: ComponentInteraction, deps: ComponentDeps): Promise<void> {
  const code = codeFromCustomId(i.customId);
  const personagemId = Number(i.values[0]);
  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  const user = await actorFor(i, deps);
  try {
    const result = await deps.raidJoinService.join(user.id, detail.id, personagemId);
    const fresh = await deps.raidService.getDetail(detail.id);
    deps.bus.raidUpdated(fresh, 'playerJoined');
    if (result.status === 'confirmed' && isRaidFull(fresh)) deps.bus.raidUpdated(fresh, 'raidFull');
    await i.reply({
      content: result.status === 'confirmed' ? "You're signed up as **confirmed**." : "You've been added to the **waitlist**.",
      ephemeral: true,
    });
  } catch (err) {
    await i.reply({ content: joinErrorMessage(err), ephemeral: true });
  }
}

function joinErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    switch (err.statusCode) {
      case 409: return "Couldn't sign you up — you may already be in, or the raid changed.";
      case 422: return "That character can't join this raid (faction or Tier).";
      case 404: return 'Raid or character not found.';
      case 403: return 'You can only sign up your own character.';
    }
  }
  return 'Something went wrong.';
}

export async function handleLeaveClick(i: ComponentInteraction, deps: ComponentDeps): Promise<void> {
  const code = codeFromCustomId(i.customId);
  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  const user = await actorFor(i, deps);
  try {
    await deps.raidJoinService.leave(user.id, detail.id);
    deps.bus.raidUpdated(await deps.raidService.getDetail(detail.id), 'playerLeft');
    await i.reply({ content: 'You left the raid.', ephemeral: true });
  } catch (err) {
    await i.reply({ content: leaveErrorMessage(err), ephemeral: true });
  }
}

function leaveErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    if (err.statusCode === 404) return "You weren't signed up.";
    if (err.statusCode === 409) return "This raid isn't open for sign-ups.";
  }
  return 'Something went wrong.';
}
