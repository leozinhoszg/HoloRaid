import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('raids')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('codigo', 'varchar(12)', (c) => c.notNull().unique())
    .addColumn('operation', 'varchar(64)', (c) => c.notNull())
    .addColumn('difficulty', sql`enum('SM','HM','NiM')`, (c) => c.notNull())
    .addColumn('size', 'integer', (c) => c.notNull())
    .addColumn('faction', sql`enum('Republic','Empire')`, (c) => c.notNull())
    .addColumn('minimum_tier', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('check_composition', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('slots_tank', 'integer', (c) => c.notNull())
    .addColumn('slots_heal', 'integer', (c) => c.notNull())
    .addColumn('slots_dps', 'integer', (c) => c.notNull())
    .addColumn('notes', 'text')
    .addColumn('start_at', 'datetime', (c) => c.notNull())
    .addColumn('status', sql`enum('OPEN','RUNNING','FINISHED','CANCELLED')`, (c) => c.notNull().defaultTo('OPEN'))
    .addColumn('discord_message_id', 'varchar(32)')
    .addColumn('created_by', 'bigint', (c) => c.notNull().references('usuarios.id'))
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('idx_raids_status').on('raids').column('status').execute();
  await db.schema.createIndex('idx_raids_created_by').on('raids').column('created_by').execute();

  await db.schema
    .createTable('raid_players')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('raid_id', 'bigint', (c) => c.notNull().references('raids.id').onDelete('cascade'))
    .addColumn('usuario_id', 'bigint', (c) => c.notNull().references('usuarios.id'))
    .addColumn('personagem_id', 'bigint', (c) => c.notNull().references('personagens.id'))
    .addColumn('role', sql`enum('Tank','Healer','DPS')`, (c) => c.notNull())
    .addColumn('status', sql`enum('confirmed','waitlist')`, (c) => c.notNull())
    .addColumn('joined_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('uq_rp_raid_user').on('raid_players').columns(['raid_id', 'usuario_id']).unique().execute();
  await db.schema.createIndex('idx_rp_raid_status').on('raid_players').columns(['raid_id', 'status']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('raid_players').ifExists().execute();
  await db.schema.dropTable('raids').ifExists().execute();
}
