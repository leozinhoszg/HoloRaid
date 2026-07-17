import type { Generated, ColumnType } from 'kysely';

type Created = ColumnType<Date, Date | string | undefined, never>;
type Updated = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsuariosTable {
  id: Generated<number>;
  discord_id: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
  email: string | null;
  role: 'user' | 'admin';
  created_at: Created;
  updated_at: Updated;
}

export interface RefreshTokensTable {
  id: Generated<number>;
  usuario_id: number;
  token_hash: string;
  family_id: string;
  device: string | null;
  expires_at: ColumnType<Date, Date | string, never>;
  revoked_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Created;
}

export interface AdminAuditLogTable {
  id: Generated<number>;
  actor_id: number;
  action: string;
  target_id: number | null;
  metadata: ColumnType<unknown, string | null, string | null>;
  created_at: Created;
}

export interface PersonagensTable {
  id: Generated<number>;
  usuario_id: number;
  nome: string;
  faccao: 'Republic' | 'Empire';
  classe: string;
  especializacao: string | null;
  role: 'Tank' | 'Healer' | 'DPS';
  origin_story: string | null;
  item_level: number;
  total_points: number;
  created_at: Created;
  updated_at: Updated;
}

export interface BossesTable {
  id: Generated<number>;
  operation: string;
  boss: string;
  difficulty: 'Veteran' | 'Master' | null;
  type: 'boss' | 'timer' | 'lair';
  points: number;
}

export interface CharacterBossesTable {
  id: Generated<number>;
  personagem_id: number;
  boss_id: number;
  completed_at: ColumnType<Date, Date | string, never>;
}

export interface RaidsTable {
  id: Generated<number>;
  codigo: string;
  operation: string;
  difficulty: 'SM' | 'HM' | 'NiM';
  size: number;
  faction: 'Republic' | 'Empire';
  minimum_tier: number;
  check_composition: number; // MySQL boolean = tinyint (0/1)
  disable_mentions: number; // MySQL boolean = tinyint (0/1)
  slots_tank: number;
  slots_heal: number;
  slots_dps: number;
  notes: string | null;
  start_at: ColumnType<Date, Date | string, Date | string>;
  status: 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
  discord_message_id: string | null;
  created_by: number;
  created_at: Created;
  updated_at: Updated;
}

export interface RaidPlayersTable {
  id: Generated<number>;
  raid_id: number;
  usuario_id: number;
  personagem_id: number;
  role: 'Tank' | 'Healer' | 'DPS';
  status: 'confirmed' | 'waitlist';
  joined_at: ColumnType<Date, Date | string, never>;
}

export interface GuildConfigTable {
  guild_id: string;
  raid_channel_id: string;
  created_at: Created;
  updated_at: Updated;
}

export interface RaidDiscordMessagesTable {
  id: Generated<number>;
  raid_id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  created_at: Created;
}

export interface DB {
  usuarios: UsuariosTable;
  refresh_tokens: RefreshTokensTable;
  admin_audit_log: AdminAuditLogTable;
  personagens: PersonagensTable;
  bosses: BossesTable;
  character_bosses: CharacterBossesTable;
  raids: RaidsTable;
  raid_players: RaidPlayersTable;
  guild_config: GuildConfigTable;
  raid_discord_messages: RaidDiscordMessagesTable;
}
