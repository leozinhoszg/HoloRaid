import { Kysely } from 'kysely';

// O MySQL ignora silenciosamente REFERENCES inline na coluna (o que as migrations
// 001–004 usaram), então nenhuma FK foi criada. Estas são as mesmas relações que
// aquelas migrations declararam, agora em nível de tabela — a única forma honrada.
// O ON DELETE de cada uma replica exatamente o que foi declarado na origem.
const FKS: { table: string; name: string; column: string; target: string; onDelete: 'cascade' | 'restrict' }[] = [
  { table: 'refresh_tokens', name: 'fk_rt_usuario', column: 'usuario_id', target: 'usuarios', onDelete: 'cascade' },
  { table: 'admin_audit_log', name: 'fk_aal_actor', column: 'actor_id', target: 'usuarios', onDelete: 'restrict' },
  { table: 'personagens', name: 'fk_pers_usuario', column: 'usuario_id', target: 'usuarios', onDelete: 'cascade' },
  { table: 'character_bosses', name: 'fk_cb_personagem', column: 'personagem_id', target: 'personagens', onDelete: 'cascade' },
  { table: 'character_bosses', name: 'fk_cb_boss', column: 'boss_id', target: 'bosses', onDelete: 'restrict' },
  { table: 'raids', name: 'fk_raids_created_by', column: 'created_by', target: 'usuarios', onDelete: 'restrict' },
  { table: 'raid_players', name: 'fk_rp_raid', column: 'raid_id', target: 'raids', onDelete: 'cascade' },
  { table: 'raid_players', name: 'fk_rp_usuario', column: 'usuario_id', target: 'usuarios', onDelete: 'restrict' },
  { table: 'raid_players', name: 'fk_rp_personagem', column: 'personagem_id', target: 'personagens', onDelete: 'restrict' },
  { table: 'raid_discord_messages', name: 'fk_rdm_raid', column: 'raid_id', target: 'raids', onDelete: 'cascade' },
];

export async function up(db: Kysely<any>): Promise<void> {
  for (const fk of FKS) {
    await db.schema
      .alterTable(fk.table)
      .addForeignKeyConstraint(fk.name, [fk.column], fk.target, ['id'])
      .onDelete(fk.onDelete)
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const fk of [...FKS].reverse()) {
    await db.schema.alterTable(fk.table).dropConstraint(fk.name).execute();
  }
}
