import { Kysely, sql } from 'kysely';

// Hateful Entity e Dreadful Entity deixam de ser lairs soltos e passam a ser
// bosses secretos dentro de suas operações. Idempotente: em banco novo (seed já
// corrigido) os valores já estão certos e o UPDATE vira no-op.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE bosses SET operation = 'Scum and Villainy', type = 'boss'
    WHERE boss = 'Hateful Entity'
  `.execute(db);
  await sql`
    UPDATE bosses SET operation = 'Terror From Beyond', type = 'boss'
    WHERE boss = 'Dreadful Entity'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE bosses SET operation = 'Hateful Entity', type = 'lair'
    WHERE boss = 'Hateful Entity'
  `.execute(db);
  await sql`
    UPDATE bosses SET operation = 'Dreadful Entity', type = 'lair'
    WHERE boss = 'Dreadful Entity'
  `.execute(db);
}
