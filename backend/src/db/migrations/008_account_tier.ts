import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Pontos na conta
  await db.schema.alterTable('usuarios')
    .addColumn('total_points', 'integer', (c) => c.notNull().defaultTo(0))
    .execute();

  // 2. Ledger de bosses por conta
  await db.schema.createTable('usuario_bosses')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('usuario_id', 'bigint', (c) => c.notNull())
    .addColumn('boss_id', 'bigint', (c) => c.notNull())
    .addColumn('completed_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('idx_ub_usuario').on('usuario_bosses').column('usuario_id').execute();
  await db.schema.createIndex('uq_ub_usuario_boss').on('usuario_bosses').columns(['usuario_id', 'boss_id']).unique().execute();
  await db.schema.alterTable('usuario_bosses')
    .addForeignKeyConstraint('fk_ub_usuario', ['usuario_id'], 'usuarios', ['id']).onDelete('cascade').execute();
  await db.schema.alterTable('usuario_bosses')
    .addForeignKeyConstraint('fk_ub_boss', ['boss_id'], 'bosses', ['id']).onDelete('restrict').execute();

  // 3. Une os bosses de todos os personagens em cada conta (distinto por boss)
  await sql`
    INSERT INTO usuario_bosses (usuario_id, boss_id, completed_at)
    SELECT p.usuario_id, cb.boss_id, MIN(cb.completed_at)
    FROM character_bosses cb
    JOIN personagens p ON p.id = cb.personagem_id
    GROUP BY p.usuario_id, cb.boss_id
  `.execute(db);

  // 4. Recalcula os pontos da conta a partir do novo ledger
  await sql`
    UPDATE usuarios u SET total_points = COALESCE((
      SELECT SUM(b.points) FROM usuario_bosses ub
      JOIN bosses b ON b.id = ub.boss_id
      WHERE ub.usuario_id = u.id
    ), 0)
  `.execute(db);

  // 5. Derruba as estruturas por personagem (dropTable remove as FKs de saída da própria tabela)
  await db.schema.dropTable('character_bosses').execute();
  await db.schema.alterTable('personagens').dropColumn('total_points').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Reverte a estrutura (dados não são restaurados).
  await db.schema.alterTable('personagens')
    .addColumn('total_points', 'integer', (c) => c.notNull().defaultTo(0)).execute();
  await db.schema.createTable('character_bosses')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('personagem_id', 'bigint', (c) => c.notNull())
    .addColumn('boss_id', 'bigint', (c) => c.notNull())
    .addColumn('completed_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('idx_cb_personagem').on('character_bosses').column('personagem_id').execute();
  await db.schema.createIndex('uq_cb_pers_boss').on('character_bosses').columns(['personagem_id', 'boss_id']).unique().execute();
  await db.schema.alterTable('character_bosses')
    .addForeignKeyConstraint('fk_cb_personagem', ['personagem_id'], 'personagens', ['id']).onDelete('cascade').execute();
  await db.schema.alterTable('character_bosses')
    .addForeignKeyConstraint('fk_cb_boss', ['boss_id'], 'bosses', ['id']).onDelete('restrict').execute();
  await db.schema.dropTable('usuario_bosses').execute();
  await db.schema.alterTable('usuarios').dropColumn('total_points').execute();
}
