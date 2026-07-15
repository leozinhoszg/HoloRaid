import { Kysely, sql } from 'kysely';
import { BOSSES_SEED } from '../../reference/bossesSeed';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('personagens')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('usuario_id', 'bigint', (c) => c.notNull().references('usuarios.id').onDelete('cascade'))
    .addColumn('nome', 'varchar(64)', (c) => c.notNull())
    .addColumn('faccao', sql`enum('Republic','Empire')`, (c) => c.notNull())
    .addColumn('classe', 'varchar(32)', (c) => c.notNull())
    .addColumn('especializacao', 'varchar(48)')
    .addColumn('role', sql`enum('Tank','Healer','DPS')`, (c) => c.notNull())
    .addColumn('origin_story', 'varchar(32)')
    .addColumn('item_level', 'integer', (c) => c.notNull())
    .addColumn('total_points', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('idx_pers_usuario').on('personagens').column('usuario_id').execute();

  await db.schema
    .createTable('bosses')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('operation', 'varchar(64)', (c) => c.notNull())
    .addColumn('boss', 'varchar(64)', (c) => c.notNull())
    .addColumn('difficulty', sql`enum('Veteran','Master')`)
    .addColumn('type', sql`enum('boss','timer','lair')`, (c) => c.notNull())
    .addColumn('points', 'integer', (c) => c.notNull().defaultTo(1))
    .execute();

  await db.schema
    .createTable('character_bosses')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('personagem_id', 'bigint', (c) => c.notNull().references('personagens.id').onDelete('cascade'))
    .addColumn('boss_id', 'bigint', (c) => c.notNull().references('bosses.id'))
    .addColumn('completed_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('idx_cb_personagem').on('character_bosses').column('personagem_id').execute();
  await db.schema
    .createIndex('uq_cb_pers_boss').on('character_bosses').columns(['personagem_id', 'boss_id']).unique().execute();

  // Seed dos bosses
  await db.insertInto('bosses').values(BOSSES_SEED).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('character_bosses').ifExists().execute();
  await db.schema.dropTable('personagens').ifExists().execute();
  await db.schema.dropTable('bosses').ifExists().execute();
}
