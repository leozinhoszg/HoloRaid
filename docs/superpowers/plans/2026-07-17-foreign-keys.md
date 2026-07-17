# Integridade referencial (007) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar as 10 foreign keys que as migrations 001–004 declararam mas o MySQL descartou, e bloquear com erro claro (409) a exclusão de personagem inscrito numa raid.

**Architecture:** Uma migration `007` com `addForeignKeyConstraint` (nível de tabela — a única forma que o MySQL honra), replicando **exatamente** o `ON DELETE` de cada declaração original. Uma guarda no `characters.service.remove` transforma o erro cru de FK num 409 de domínio; a FK vira a rede de segurança.

**Tech Stack:** Kysely 0.29 + mysql2, MySQL 8.0.42 (`DROP CONSTRAINT` exige ≥ 8.0.19 — confirmado), vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-foreign-keys-design.md`.
- **Use `addForeignKeyConstraint`, NUNCA `.references()` inline** — o MySQL descarta a forma inline sem erro. É a causa raiz desta fatia.
- **Replique o `ON DELETE` declarado**, sem reinterpretar: onde a migration original tinha `.onDelete('cascade')` → CASCADE; onde não tinha → RESTRICT.
- **Não corrija as migrations 001–004** — já rodaram; a 007 é aditiva.
- **Não limpe órfãos** e não crie endpoint de apagar usuário (fora de escopo).
- **`raidPlayerRepo` é OBRIGATÓRIO** no `createCharacterService` — diferente do padrão opcional do #6/#6b. Uma guarda de segurança que pode ser silenciosamente esquecida não é guarda.
- **Regressão:** os **199 testes** de #1–#6b seguem verdes.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Backend roda em `backend/`. Testes: `npx vitest run <arquivo>`. Typecheck: `npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"` (**não use pipe** — engole o exit code).

---

### Task 1: Migration 007 — as 10 foreign keys

**Files:**
- Create: `backend/src/db/migrations/007_foreign_keys.ts`

**Interfaces:**
- Consumes: tabelas de 001–004.
- Produces: 10 constraints nomeadas (`fk_rt_usuario`, `fk_aal_actor`, `fk_pers_usuario`, `fk_cb_personagem`, `fk_cb_boss`, `fk_raids_created_by`, `fk_rp_raid`, `fk_rp_usuario`, `fk_rp_personagem`, `fk_rdm_raid`).

> **API do Kysely (confirmada):** no `alterTable`, `addForeignKeyConstraint(nome, colunas, tabelaAlvo, colunasAlvo)` **retorna o builder** — encadeie `.onDelete(...)` e `.execute()`. (No `createTable` é diferente: recebe callback, como fizemos na `006`.)

- [ ] **Step 1: Criar a migration**

Crie `backend/src/db/migrations/007_foreign_keys.ts`:

```ts
import { Kysely } from 'kysely';

// O MySQL ignora silenciosamente REFERENCES inline na coluna (o que as migrations
// 001–004 usaram), então nenhuma FK foi criada. Estas são as mesmas relações que
// aquelas migrations declararam, agora em nível de tabela — a única forma honrada.
// O ON DELETE de cada uma replica exatamente o que foi declarado na origem.
const FKS: { table: string; name: string; column: string; target: string; onDelete: 'cascade' | 'restrict' }[] = [
  { table: 'refresh_tokens',        name: 'fk_rt_usuario',       column: 'usuario_id',    target: 'usuarios',    onDelete: 'cascade' },
  { table: 'admin_audit_log',       name: 'fk_aal_actor',        column: 'actor_id',      target: 'usuarios',    onDelete: 'restrict' },
  { table: 'personagens',           name: 'fk_pers_usuario',     column: 'usuario_id',    target: 'usuarios',    onDelete: 'cascade' },
  { table: 'character_bosses',      name: 'fk_cb_personagem',    column: 'personagem_id', target: 'personagens', onDelete: 'cascade' },
  { table: 'character_bosses',      name: 'fk_cb_boss',          column: 'boss_id',       target: 'bosses',      onDelete: 'restrict' },
  { table: 'raids',                 name: 'fk_raids_created_by', column: 'created_by',    target: 'usuarios',    onDelete: 'restrict' },
  { table: 'raid_players',          name: 'fk_rp_raid',          column: 'raid_id',       target: 'raids',       onDelete: 'cascade' },
  { table: 'raid_players',          name: 'fk_rp_usuario',       column: 'usuario_id',    target: 'usuarios',    onDelete: 'restrict' },
  { table: 'raid_players',          name: 'fk_rp_personagem',    column: 'personagem_id', target: 'personagens', onDelete: 'restrict' },
  { table: 'raid_discord_messages', name: 'fk_rdm_raid',         column: 'raid_id',       target: 'raids',       onDelete: 'cascade' },
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
```

- [ ] **Step 2: Aplicar e verificar no banco real**

Run: `cd backend && npm run migrate`
Expected: `OK: 007_foreign_keys`, sem erro. (Se falhar com erro de FK, há órfão no banco — **pare e reporte**; limpar órfão está fora de escopo.)

Verifique que as 11 FKs existem (10 novas + `fk_dt_usuario` do #6):

```bash
cd backend && cat > fk.tmp.ts <<'EOF'
import 'dotenv/config';
import mysql from 'mysql2/promise';
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [rows] = await c.query(`
    SELECT k.CONSTRAINT_NAME AS nome, k.TABLE_NAME AS tabela, k.COLUMN_NAME AS coluna,
           k.REFERENCED_TABLE_NAME AS alvo, r.DELETE_RULE AS on_delete
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA
    WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME`, [process.env.DB_NAME]);
  console.table(rows);
  console.log('TOTAL:', (rows as any[]).length, '(esperado 11)');
  await c.end();
})().catch((e) => { console.log('FALHOU:', e.sqlMessage || e.message); process.exit(1); });
EOF
npx tsx fk.tmp.ts; rm -f fk.tmp.ts
```
Expected: **TOTAL: 11**, e o `on_delete` de cada linha batendo com a tabela da Seção 1 da spec (CASCADE em `fk_rt_usuario`, `fk_pers_usuario`, `fk_cb_personagem`, `fk_rp_raid`, `fk_rdm_raid`, `fk_dt_usuario`; RESTRICT no resto).

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/007_foreign_keys.ts
git commit -m "feat(db): migration 007 — cria as 10 foreign keys ausentes"
```

---

### Task 2: Guarda contra apagar personagem inscrito

**Files:**
- Modify: `backend/src/db/repositories/raidPlayerRepo.ts` (interface + impl)
- Modify: `backend/tests/fakes/fakeRepos.ts` (`makeFakeRaidPlayerRepo`)
- Modify: `backend/src/modules/characters/characters.service.ts` (deps + `remove`)
- Modify: `backend/src/server.ts:51`
- Modify: `backend/tests/characters.routes.test.ts:17-20`
- Modify: `backend/tests/progressionSelf.test.ts:17-20`
- Test: `backend/tests/characters.routes.test.ts`

**Interfaces:**
- Consumes: `PersonagemRepo` (#2), `ConflictError` (#1).
- Produces:
  - `RaidPlayerRepo.existsByPersonagem(personagemId: number): Promise<boolean>`
  - `createCharacterService(deps: { personagemRepo: PersonagemRepo; raidPlayerRepo: RaidPlayerRepo })` — **`raidPlayerRepo` obrigatório**.
  - `remove()` lança `ConflictError` (409) se o personagem estiver inscrito.

- [ ] **Step 1: Write the failing test**

Em `backend/tests/characters.routes.test.ts`:

**(a)** ajuste os imports e o `build()` para injetar o repo novo (e devolvê-lo):

```ts
import { makeFakePersonagemRepo, makeFakeBossRepo, makeFakeCharacterBossRepo, makeFakeRaidPlayerRepo } from './fakes/fakeRepos';
```
```ts
function build() {
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const charBossRepo = makeFakeCharacterBossRepo(bossRepo);
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const characterService = createCharacterService({ personagemRepo, raidPlayerRepo });
  const progressionService = createProgressionService({ personagemRepo, bossRepo, charBossRepo });
  const app = createApp({ authService: {} as any, characterService, progressionService, bossRepo });
  return { app, personagemRepo, raidPlayerRepo };
}
```

**(b)** adicione o describe novo ao final do arquivo:

```ts
describe('apagar personagem inscrito (007)', () => {
  it('personagem inscrito numa raid → 409 e NÃO apaga', async () => {
    const { app, personagemRepo, raidPlayerRepo } = build();
    const p = await personagemRepo.create({ usuario_id: 1, nome: 'Kira', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });
    await raidPlayerRepo.create({ raid_id: 99, usuario_id: 1, personagem_id: p.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });

    const res = await request(app).delete(`/characters/${p.id}`).set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(res.status).toBe(409);
    expect(await personagemRepo.findById(p.id)).not.toBeNull(); // não apagou
  });

  it('personagem livre → apaga normalmente', async () => {
    const { app, personagemRepo } = build();
    const p = await personagemRepo.create({ usuario_id: 1, nome: 'Solo', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });

    const res = await request(app).delete(`/characters/${p.id}`).set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(res.status).toBe(204);
    expect(await personagemRepo.findById(p.id)).toBeNull();
  });

  it('existsByPersonagem reflete a inscrição', async () => {
    const { personagemRepo, raidPlayerRepo } = build();
    const p = await personagemRepo.create({ usuario_id: 1, nome: 'X', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });
    expect(await raidPlayerRepo.existsByPersonagem(p.id)).toBe(false);
    await raidPlayerRepo.create({ raid_id: 99, usuario_id: 1, personagem_id: p.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
    expect(await raidPlayerRepo.existsByPersonagem(p.id)).toBe(true);
  });
});
```

> Rota confirmada: `DELETE /characters/:id` (`characters.router.ts:22`), sucesso = **204** (`characters.controller.ts:22`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/characters.routes.test.ts`
Expected: FAIL — `raidPlayerRepo.existsByPersonagem is not a function` (e o teste do 409 recebendo 204).

- [ ] **Step 3: `existsByPersonagem` no repo**

Em `backend/src/db/repositories/raidPlayerRepo.ts`, adicione à interface (depois de `listRoster`):

```ts
  existsByPersonagem(personagemId: number): Promise<boolean>;
```

e ao `createRaidPlayerRepo` (depois de `listRoster`):

```ts
    async existsByPersonagem(personagemId) {
      const r = await db.selectFrom('raid_players').select('id')
        .where('personagem_id', '=', personagemId).limit(1).executeTakeFirst();
      return !!r;
    },
```

- [ ] **Step 4: `existsByPersonagem` no fake**

Em `backend/tests/fakes/fakeRepos.ts`, no `makeFakeRaidPlayerRepo`, adicione (depois de `listRoster`):

```ts
    async existsByPersonagem(personagemId) { return rows.some((r) => r.personagem_id === personagemId); },
```

- [ ] **Step 5: A guarda no service**

Em `backend/src/modules/characters/characters.service.ts`:

**(a)** imports e assinatura:

```ts
import type { PersonagemRepo, PersonagemRecord, PersonagemInput } from '../../db/repositories/personagemRepo';
import type { RaidPlayerRepo } from '../../db/repositories/raidPlayerRepo';
```
```ts
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../common/errors/AppError';
```
```ts
export function createCharacterService(deps: { personagemRepo: PersonagemRepo; raidPlayerRepo: RaidPlayerRepo }) {
```

**(b)** o `remove`:

```ts
    async remove(actorId: number, id: number): Promise<void> {
      await owned(actorId, id);
      // A FK fk_rp_personagem (007) recusaria isso no banco; aqui viramos um 409 de domínio.
      if (await deps.raidPlayerRepo.existsByPersonagem(id)) {
        throw new ConflictError('Este personagem está inscrito em uma raid. Saia da raid antes de apagá-lo.');
      }
      await deps.personagemRepo.delete(id);
    },
```

- [ ] **Step 6: Atualizar os 3 callers**

`backend/src/server.ts:51`:

```ts
const characterService = createCharacterService({ personagemRepo, raidPlayerRepo });
```

> **Atenção à ordem:** `raidPlayerRepo` é criado hoje na linha ~49 (`const raidPlayerRepo = createRaidPlayerRepo(db);`), **depois** do `characterService` (linha 51). Mova a criação do `raidPlayerRepo` para **antes** do `characterService`, junto do `personagemRepo`. Se não mover, é `ReferenceError` em runtime (`const` não sofre hoisting).

`backend/tests/progressionSelf.test.ts` — mesmo ajuste do `build()` da Task 2, Step 1(a):

```ts
import { makeFakePersonagemRepo, makeFakeBossRepo, makeFakeCharacterBossRepo, makeFakeRaidPlayerRepo } from './fakes/fakeRepos';
```
```ts
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const characterService = createCharacterService({ personagemRepo, raidPlayerRepo });
```

(`characters.routes.test.ts` já foi ajustado no Step 1.)

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/characters.routes.test.ts tests/progressionSelf.test.ts`
Expected: todos PASS.

Run: `cd backend && npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/db/repositories/raidPlayerRepo.ts backend/src/modules/characters/characters.service.ts backend/src/server.ts backend/tests/fakes/fakeRepos.ts backend/tests/characters.routes.test.ts backend/tests/progressionSelf.test.ts
git commit -m "feat(characters): bloqueia apagar personagem inscrito em raid (409)"
```

---

### Task 3: Verificação final

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa + typecheck + build**

Run: `cd backend && npm test`
Expected: **todos passam**. Antes eram 199; o plano acrescenta **3** → espere **202 passed, 0 failed**.

Run: `cd backend && npm run typecheck > /dev/null 2>&1; echo "typecheck EXIT=$?"; npm run build > /dev/null 2>&1; echo "build EXIT=$?"`
Expected: ambos `EXIT=0`.

- [ ] **Step 2: Smoke real — é ISTO que prova a fatia**

Os fakes não têm FK; só o MySQL real prova que as constraints funcionam.

```bash
cd backend && cat > smoke.tmp.ts <<'EOF'
import 'dotenv/config';
import { db } from './src/db/db';
import { createUserRepo } from './src/db/repositories/userRepo';
import { createPersonagemRepo } from './src/db/repositories/personagemRepo';
import { createRaidRepo } from './src/db/repositories/raidRepo';
import { createRaidPlayerRepo } from './src/db/repositories/raidPlayerRepo';

const falhaComFk = async (fn: () => Promise<unknown>) => {
  try { await fn(); return false; } catch (e: any) { return /foreign key|1451|1452/i.test(e.sqlMessage || e.message || ''); }
};

(async () => {
  const userRepo = createUserRepo(db);
  const personagemRepo = createPersonagemRepo(db);
  const raidRepo = createRaidRepo(db);
  const raidPlayerRepo = createRaidPlayerRepo(db);

  const u = await userRepo.upsertByDiscordId({ discord_id: 'smk007', username: 's7', nickname: null, avatar: null, email: null, role: 'user' });
  const p = await personagemRepo.create({ usuario_id: u.id, nome: 'Smk7', faccao: 'Republic', classe: 'Guardian', especializacao: 'Vigilance', role: 'DPS', origin_story: 'Jedi Knight', item_level: 330 } as any);
  const raid = await raidRepo.create({ codigo: 'SMK007', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z'), created_by: u.id } as any);
  await raidPlayerRepo.create({ raid_id: raid.id, usuario_id: u.id, personagem_id: p.id, role: 'DPS', status: 'confirmed', joined_at: new Date() });

  // 1. RESTRICT: personagem inscrito não pode ser apagado
  const r1 = await falhaComFk(() => personagemRepo.delete(p.id));
  console.log('--> DELETE personagem inscrito falha com FK:', r1, '(esperado true)');

  // 2. RESTRICT: usuario com raid criada não pode ser apagado
  const r2 = await falhaComFk(() => db.deleteFrom('usuarios').where('id', '=', u.id).execute());
  console.log('--> DELETE usuario com raid falha com FK:', r2, '(esperado true)');

  // 3. CASCADE: apagar a raid limpa raid_players (o #3 sempre assumiu isto)
  await raidRepo.delete(raid.id);
  const sobrou = await raidPlayerRepo.existsByPersonagem(p.id);
  console.log('--> apos DELETE raid, raid_players cascateou:', !sobrou, '(esperado true)');

  // 4. CASCADE: apagar usuario agora limpa personagens
  await db.deleteFrom('usuarios').where('id', '=', u.id).execute();
  const pSobrou = await personagemRepo.findById(p.id);
  console.log('--> apos DELETE usuario, personagem cascateou:', pSobrou === null, '(esperado true)');

  const ok = r1 && r2 && !sobrou && pSobrou === null;
  console.log(ok ? '\n=== SMOKE OK ===' : '\n=== SMOKE FALHOU ===');
  await db.destroy();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FALHOU:', e.code || '', e.sqlMessage || e.message); process.exit(1); });
EOF
npx tsx smoke.tmp.ts; rm -f smoke.tmp.ts
```
Expected: os 4 `true` e `=== SMOKE OK ===`. Os passos 1–2 provam o RESTRICT; os 3–4 provam o CASCADE que o #3 sempre assumiu e nunca teve.

- [ ] **Step 3: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "test(db): verificacao da 007 (regressao + smoke de FK)"
```

---

## Notas de execução

- **Branch:** execute em `feat/foreign-keys` e faça merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** 1 → 2 → 3. A Task 2 depende das FKs existirem para o smoke fazer sentido.
- **Cuidado com o `cd`:** um `cd` de commit anterior persiste no shell; prefixe os comandos com `cd /d/HoloRaid/backend &&`.
- **Se a migration falhar por órfão**, pare e reporte — limpar dados sujos está fora de escopo e é decisão do dono.
