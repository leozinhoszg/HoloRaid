import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // ATENÇÃO: o MySQL ignora silenciosamente REFERENCES inline na coluna
  // (addColumn(...).references(...)). A FK só existe de verdade via
  // addForeignKeyConstraint, que gera a cláusula FOREIGN KEY em nível de tabela.
  await db.schema
    .createTable('device_tokens')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('usuario_id', 'bigint', (c) => c.notNull())
    .addColumn('token', 'varchar(255)', (c) => c.notNull().unique())
    .addColumn('platform', sql`enum('android','web')`, (c) => c.notNull())
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addForeignKeyConstraint('fk_dt_usuario', ['usuario_id'], 'usuarios', ['id'], (cb) => cb.onDelete('cascade'))
    .execute();
  await db.schema.createIndex('idx_dt_usuario').on('device_tokens').column('usuario_id').execute();

  await db.schema.alterTable('usuarios')
    .addColumn('push_enabled', 'boolean', (c) => c.notNull().defaultTo(true)).execute();
  await db.schema.alterTable('raids')
    .addColumn('starting_notified_at', 'datetime').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('raids').dropColumn('starting_notified_at').execute();
  await db.schema.alterTable('usuarios').dropColumn('push_enabled').execute();
  await db.schema.dropTable('device_tokens').ifExists().execute();
}
