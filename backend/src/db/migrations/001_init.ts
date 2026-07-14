import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('usuarios')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('discord_id', 'varchar(32)', (c) => c.notNull().unique())
    .addColumn('username', 'varchar(255)', (c) => c.notNull())
    .addColumn('nickname', 'varchar(255)')
    .addColumn('avatar', 'varchar(255)')
    .addColumn('email', 'varchar(255)')
    .addColumn('role', sql`enum('user','admin')`, (c) => c.notNull().defaultTo('user'))
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (c) =>
      c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('refresh_tokens')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('usuario_id', 'bigint', (c) =>
      c.notNull().references('usuarios.id').onDelete('cascade'))
    .addColumn('token_hash', 'char(64)', (c) => c.notNull())
    .addColumn('family_id', 'char(36)', (c) => c.notNull())
    .addColumn('device', 'varchar(255)')
    .addColumn('expires_at', 'datetime', (c) => c.notNull())
    .addColumn('revoked_at', 'datetime')
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema.createIndex('idx_rt_usuario').on('refresh_tokens').column('usuario_id').execute();
  await db.schema.createIndex('idx_rt_hash').on('refresh_tokens').column('token_hash').execute();
  await db.schema.createIndex('idx_rt_family').on('refresh_tokens').column('family_id').execute();

  await db.schema
    .createTable('admin_audit_log')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('actor_id', 'bigint', (c) => c.notNull().references('usuarios.id'))
    .addColumn('action', 'varchar(64)', (c) => c.notNull())
    .addColumn('target_id', 'bigint')
    .addColumn('metadata', 'json')
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('admin_audit_log').ifExists().execute();
  await db.schema.dropTable('refresh_tokens').ifExists().execute();
  await db.schema.dropTable('usuarios').ifExists().execute();
}
