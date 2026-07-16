import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('guild_config')
    .addColumn('guild_id', 'varchar(32)', (c) => c.primaryKey())
    .addColumn('raid_channel_id', 'varchar(32)', (c) => c.notNull())
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('raid_discord_messages')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('raid_id', 'bigint', (c) => c.notNull().references('raids.id').onDelete('cascade'))
    .addColumn('guild_id', 'varchar(32)', (c) => c.notNull())
    .addColumn('channel_id', 'varchar(32)', (c) => c.notNull())
    .addColumn('message_id', 'varchar(32)', (c) => c.notNull())
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('idx_rdm_raid').on('raid_discord_messages').column('raid_id').execute();
  await db.schema.createIndex('uq_rdm_raid_channel').on('raid_discord_messages').columns(['raid_id', 'channel_id']).unique().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('raid_discord_messages').ifExists().execute();
  await db.schema.dropTable('guild_config').ifExists().execute();
}
