# HoloRaid — Integridade referencial (007) — Design

- **Data:** 2026-07-17
- **Subsistema:** correção transversal de banco (não é uma feature)
- **Depende de:** migrations 001–006 aplicadas.
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

Descoberto em 2026-07-17 pelo smoke do #6: **o banco não tem nenhuma foreign key.**

Todas as migrations 001–004 declaram relações assim:

```ts
.addColumn('usuario_id', 'bigint', (c) => c.notNull().references('usuarios.id').onDelete('cascade'))
```

Mas o **MySQL ignora silenciosamente `REFERENCES` inline na definição da coluna**. A
[documentação](https://dev.mysql.com/doc/refman/8.0/en/create-table-foreign-keys.html) é
explícita: *"MySQL does not recognize or support 'inline REFERENCES specifications' ... MySQL
accepts REFERENCES clauses only when specified as part of a separate FOREIGN KEY
specification."* O `addColumn(...).references(...)` do Kysely gera exatamente a forma inline —
o MySQL parseia e descarta, **sem erro e sem aviso**.

O `information_schema` confirma: zero FKs. As tabelas são InnoDB, então não é limitação de
engine. Só a `006_push` está correta, porque usou `addForeignKeyConstraint`.

**Consequências reais, não teóricas:**
- `raidRepo.delete(id)` (#3) conta com um CASCADE que não existe → apagar uma raid deixa
  `raid_players` e `raid_discord_messages` órfãos.
- `characters.service.remove` apaga um personagem **sem checar inscrição** → o roster passa a
  apontar para um personagem inexistente.
- Nada impede um `usuario_id` inválido em qualquer tabela.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Escopo | Criar as **10 FKs** declaradas-mas-ausentes, via `addForeignKeyConstraint`. |
| `ON DELETE` | **Exatamente o que cada migration declarou.** Onde havia `.onDelete('cascade')` → CASCADE; onde não havia → RESTRICT (default do SQL). Sem reinterpretar intenção. |
| Personagem inscrito | **Bloquear com erro claro** (409), não CASCADE. Guarda no `characters.service.remove` + FK RESTRICT como rede de segurança. |
| Órfãos pré-existentes | Fora de escopo — o banco de dev está zerado. Anotado como risco. |
| `raids.created_by` RESTRICT | Aceito: não existe endpoint de apagar usuário; o bloqueio só apareceria num DELETE manual, e ali é o comportamento desejado. |

## Objetivos e critérios de sucesso

- `information_schema.KEY_COLUMN_USAGE` passa a listar **10 FKs** no schema `holoraid`
  (11 com a `fk_dt_usuario` do #6).
- Apagar uma **raid** → `raid_players` e `raid_discord_messages` cascateiam.
- Apagar um **usuário** → `personagens`, `refresh_tokens` e `device_tokens` cascateiam
  (bloqueado se ele tiver raid criada ou inscrição — ver Riscos).
- Apagar um **personagem inscrito** → **409** com mensagem clara, e o registro **não** é apagado.
- Apagar um personagem **livre** → funciona normalmente.
- `usuario_id`/`raid_id` inválido → o banco recusa o INSERT.
- Os 199 testes de #1–#6b seguem verdes.

## Fora de escopo

- Limpar órfãos pré-existentes (o banco de dev está zerado).
- Endpoint de apagar usuário (não existe e não será criado aqui).
- Revisar/alterar o `ON DELETE` declarado por qualquer migration (só materializamos o que já
  estava escrito).
- Corrigir as migrations 001–004 retroativamente — elas já rodaram; a 007 é aditiva.

---

## Seção 1 — A migration `007_foreign_keys.ts`

Adiciona as 10 FKs com `addForeignKeyConstraint`. Nomes seguem o padrão da `006` (`fk_<tabela
abreviada>_<alvo>`):

| # | Constraint | Tabela.coluna | → Alvo | ON DELETE |
|---|-----------|---------------|--------|-----------|
| 1 | `fk_rt_usuario` | `refresh_tokens.usuario_id` | `usuarios.id` | **CASCADE** |
| 2 | `fk_aal_actor` | `admin_audit_log.actor_id` | `usuarios.id` | RESTRICT |
| 3 | `fk_pers_usuario` | `personagens.usuario_id` | `usuarios.id` | **CASCADE** |
| 4 | `fk_cb_personagem` | `character_bosses.personagem_id` | `personagens.id` | **CASCADE** |
| 5 | `fk_cb_boss` | `character_bosses.boss_id` | `bosses.id` | RESTRICT |
| 6 | `fk_raids_created_by` | `raids.created_by` | `usuarios.id` | RESTRICT |
| 7 | `fk_rp_raid` | `raid_players.raid_id` | `raids.id` | **CASCADE** |
| 8 | `fk_rp_usuario` | `raid_players.usuario_id` | `usuarios.id` | RESTRICT |
| 9 | `fk_rp_personagem` | `raid_players.personagem_id` | `personagens.id` | RESTRICT |
| 10 | `fk_rdm_raid` | `raid_discord_messages.raid_id` | `raids.id` | **CASCADE** |

Cada uma espelha o que a migration original declarou — a coluna "ON DELETE" acima é
verificável linha a linha contra `001_init.ts`, `002_personagens.ts`, `003_raids.ts` e
`004_discord.ts`.

O `down` remove as 10 por nome (`dropConstraint`), na ordem inversa.

**Nota de coerência (documentar, não "consertar"):** a combinação declarada torna a exclusão
de um usuário que já jogou **impossível na prática** — `fk_rp_usuario` (RESTRICT) barra antes
que os CASCADEs de `personagens`/`refresh_tokens` sequer sejam avaliados. Isso é consequência
fiel do que as migrations pediram, e é inofensivo porque não há endpoint de apagar usuário.
Alterar esse desenho seria outra fatia, com decisão de produto própria.

## Seção 2 — A guarda no `characters.service`

Sem ela, apagar um personagem inscrito devolveria **500** com o erro cru do MySQL. A regra
vira explícita no domínio:

```ts
async remove(actorId: number, id: number): Promise<void> {
  await owned(actorId, id);
  if (await deps.raidPlayerRepo.existsByPersonagem(id)) {
    throw new ConflictError('Este personagem está inscrito em uma raid. Saia da raid antes de apagá-lo.');
  }
  await deps.personagemRepo.delete(id);
},
```

Exige:
- **`RaidPlayerRepo.existsByPersonagem(personagemId: number): Promise<boolean>`** (novo).
- **`raidPlayerRepo` injetado no `createCharacterService`** — hoje ele recebe só
  `personagemRepo`. Dependência nova entre módulos, legítima: a regra é "personagem em uso não
  se apaga", e quem sabe do uso é o roster.
- `ConflictError` (já existe) → **409** pelo `errorHandler`.

A FK RESTRICT continua sendo a **rede de segurança**: se algum caminho futuro esquecer a
guarda, o banco recusa.

## Seção 3 — Testes

**Unit (fakes):**
- `remove` com personagem inscrito → lança `ConflictError` (409) e **não** chama `delete`.
- `remove` com personagem livre → apaga normalmente.
- `remove` de personagem de outro usuário → segue `ForbiddenError` (regressão do #2).
- `existsByPersonagem` → `true` quando há inscrição, `false` quando não há.

**Smoke real contra o MySQL** (é o teste que de fato prova esta fatia — os fakes não têm FK):
1. `information_schema` lista as **11** FKs esperadas (10 novas + `fk_dt_usuario`).
2. usuário → personagem → raid → join; `DELETE FROM personagens` direto → **falha com erro de
   FK** (prova o RESTRICT).
3. `raidRepo.delete(raid)` → `raid_players` **zera** (prova o CASCADE que o #3 sempre assumiu).
4. `DELETE FROM usuarios` com raid criada → **falha** (prova `fk_raids_created_by`).
5. Cleanup na ordem correta → tudo some.

**Regressão:** os 199 testes de #1–#6b verdes.

## Riscos e questões em aberto

- **A migration falha se houver órfão.** O `ALTER TABLE ... ADD FOREIGN KEY` recusa se existir
  linha filha sem pai. O banco de dev está **zerado** (recriado em 2026-07-17), então aplica
  limpo. Num banco com dados sujos seria preciso limpar os órfãos antes — anotado, não tratado
  (YAGNI).
- **Usuário "indeletável"** — ver a nota de coerência na Seção 1. Consequência fiel das
  declarações originais; sem impacto prático hoje.
- **Smokes futuros precisam respeitar a ordem** de exclusão (raid antes de usuário, etc.).
  Os smokes do #6/#6b já fazem isso; scripts novos precisam ter o mesmo cuidado.
- **As migrations 001–004 continuam com `.references()` inline.** Não são corrigidas (já
  rodaram; corrigi-las não mudaria banco nenhum). O risco é **repetir o erro numa migration
  nova** — por isso a regra "sempre `addForeignKeyConstraint`" está registrada na memória do
  projeto.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (migration → `existsByPersonagem` + guarda →
smoke real).

---

## Apêndice — Contratos (referência)

```ts
// Novo (db/repositories/raidPlayerRepo.ts):
existsByPersonagem(personagemId: number): Promise<boolean>

// Alterado (modules/characters/characters.service.ts):
createCharacterService(deps: { personagemRepo: PersonagemRepo; raidPlayerRepo: RaidPlayerRepo })
// remove() passa a lançar ConflictError (409) se o personagem estiver inscrito.

// Migration 007: 10x
//   .addForeignKeyConstraint('<nome>', ['<coluna>'], '<tabela alvo>', ['id'], (cb) => cb.onDelete('cascade'|'restrict'))
//   via db.schema.alterTable('<tabela>')
```
