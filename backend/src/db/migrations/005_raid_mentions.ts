import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('raids')
    .addColumn('disable_mentions', 'boolean', (c) => c.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('raids').dropColumn('disable_mentions').execute();
}
