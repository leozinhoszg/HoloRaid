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

export interface DB {
  usuarios: UsuariosTable;
  refresh_tokens: RefreshTokensTable;
  admin_audit_log: AdminAuditLogTable;
}
