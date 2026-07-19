# Tier por conta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover a progressão PvE (bosses marcados → pontos → Tier) do personagem para a conta/usuário, com badge colorido reutilizável no perfil, menu, roster e sign.

**Architecture:** O Tier continua derivado em tempo de leitura por `calcularTier(points)`; só muda a *fonte* dos pontos: de `personagens.total_points` para `usuarios.total_points`, com o ledger `character_bosses` (por personagem) substituído por `usuario_bosses` (por conta). A migração `008` une os bosses de todos os personagens em cada conta antes de dropar as estruturas antigas.

**Tech Stack:** Backend Node/TS + Express + Kysely (MySQL) + Zod + vitest/supertest. App Flutter + Riverpod + go_router + Dio.

## Global Constraints

- **FKs sempre com `addForeignKeyConstraint`, nunca `.references()` inline** (lição da `007`).
- Migrations com FK **falham alto** em órfãos; não limpam dados por conta própria. DDL no MySQL não é transacional.
- Services recebem repositórios por injeção; testáveis com fakes em `backend/tests/fakes/fakeRepos.ts` (sem MySQL).
- Endpoints de conta usam **sempre** `req.user!.sub`, nunca id vindo do corpo/cliente.
- `mysql2` devolve tinyint/COUNT como número/string conforme o caso; `total_points` é `integer`.
- Commits **sem** trailer Co-Authored-By (preferência do dono).
- Rodar comandos backend a partir de `backend/` (`cd backend`). Flutter pelo PowerShell.

---

### Task 1: Schema types + migration `008`

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/db/migrations/008_account_tier.ts`

**Interfaces:**
- Produces: tabela `usuario_bosses (id, usuario_id, boss_id, completed_at)` com único `(usuario_id, boss_id)` e FKs `fk_ub_usuario` (cascade) / `fk_ub_boss` (restrict); coluna `usuarios.total_points INT DEFAULT 0`. Remove `personagens.total_points` e a tabela `character_bosses`.

- [ ] **Step 1: Atualizar os tipos do schema**

Em `backend/src/db/schema.ts`:
- Em `UsuariosTable`, após `push_enabled`, adicionar:
```ts
  total_points: Generated<number>; // integer DEFAULT 0
```
- Em `PersonagensTable`, **remover** a linha `total_points: number;`.
- **Remover** toda a interface `CharacterBossesTable` e adicionar:
```ts
export interface UsuarioBossesTable {
  id: Generated<number>;
  usuario_id: number;
  boss_id: number;
  completed_at: ColumnType<Date, Date | string, never>;
}
```
- No `interface DB`, trocar `character_bosses: CharacterBossesTable;` por `usuario_bosses: UsuarioBossesTable;`.

- [ ] **Step 2: Escrever a migration `008`**

Criar `backend/src/db/migrations/008_account_tier.ts`:
```ts
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
```

- [ ] **Step 3: Commit** (o build ainda quebra até a Task 5 — commitamos DB layer junto ao repo na Task 2; aqui só o schema/migration)

```bash
git add backend/src/db/schema.ts backend/src/db/migrations/008_account_tier.ts
git commit -m "feat(db): migration 008 — total_points na conta + usuario_bosses (une por personagem)"
```

> A execução real da migration (`npm run migrate`) fica para o smoke da Task 8, contra o MySQL local.

---

### Task 2: Repositórios — `userRepo`, `userBossRepo`, remoção de `characterBossRepo`

**Files:**
- Modify: `backend/src/db/repositories/userRepo.ts`
- Modify: `backend/src/db/repositories/personagemRepo.ts`
- Create: `backend/src/db/repositories/userBossRepo.ts`
- Delete: `backend/src/db/repositories/characterBossRepo.ts`

**Interfaces:**
- Produces: `UserRepo` ganha `total_points` em `UserRecord` + `updateTotalPoints(id, total)`. `UserBossRepo` com `listBossIds/insertMany/deleteOne/listWithBoss` chaveado por `usuarioId`. `PersonagemRecord` perde `total_points`; `PersonagemInput = Omit<PersonagemRecord,'id'>`.

- [ ] **Step 1: `userRepo` — pontos na conta**

Em `backend/src/db/repositories/userRepo.ts`:
- `UserRecord`: adicionar `total_points: number;` após `role`.
- `COLS`: adicionar `'total_points'`.
- Interface `UserRepo`: adicionar `updateTotalPoints(id: number, total: number): Promise<void>;`.
- Implementação: adicionar
```ts
    async updateTotalPoints(id, total) {
      await db.updateTable('usuarios').set({ total_points: total, updated_at: new Date() }).where('id', '=', id).execute();
    },
```

- [ ] **Step 2: `personagemRepo` — remover pontos**

Em `backend/src/db/repositories/personagemRepo.ts`:
- `PersonagemRecord`: remover `total_points: number;`.
- `PersonagemInput`: trocar para `export type PersonagemInput = Omit<PersonagemRecord, 'id'>;`.
- `COLS`: remover `'total_points'`.
- `create`: trocar `.values({ ...p, total_points: 0, updated_at: new Date() })` por `.values({ ...p, updated_at: new Date() })`.
- Remover o método `updateTotalPoints` da interface e da implementação.

- [ ] **Step 3: Criar `userBossRepo`**

Criar `backend/src/db/repositories/userBossRepo.ts`:
```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type CompletedBossRow = {
  boss_id: number; operation: string; boss: string;
  difficulty: 'Veteran' | 'Master' | null; type: 'boss' | 'timer' | 'lair'; points: number; completed_at: Date;
};

export interface UserBossRepo {
  listBossIds(usuarioId: number): Promise<number[]>;
  insertMany(usuarioId: number, bossIds: number[]): Promise<void>;
  deleteOne(usuarioId: number, bossId: number): Promise<void>;
  listWithBoss(usuarioId: number): Promise<CompletedBossRow[]>;
}

export function createUserBossRepo(db: Kysely<DB>): UserBossRepo {
  return {
    async listBossIds(usuarioId) {
      const rows = await db.selectFrom('usuario_bosses').select('boss_id').where('usuario_id', '=', usuarioId).execute();
      return rows.map((r) => r.boss_id);
    },
    async insertMany(usuarioId, bossIds) {
      if (bossIds.length === 0) return;
      await db.insertInto('usuario_bosses')
        .values(bossIds.map((boss_id) => ({ usuario_id: usuarioId, boss_id, completed_at: new Date() })))
        .execute();
    },
    async deleteOne(usuarioId, bossId) {
      await db.deleteFrom('usuario_bosses')
        .where('usuario_id', '=', usuarioId).where('boss_id', '=', bossId).execute();
    },
    async listWithBoss(usuarioId) {
      const rows = await db.selectFrom('usuario_bosses')
        .innerJoin('bosses', 'bosses.id', 'usuario_bosses.boss_id')
        .select(['usuario_bosses.boss_id as boss_id', 'bosses.operation', 'bosses.boss', 'bosses.difficulty', 'bosses.type', 'bosses.points', 'usuario_bosses.completed_at'])
        .where('usuario_bosses.usuario_id', '=', usuarioId)
        .orderBy('bosses.operation')
        .execute();
      return rows as CompletedBossRow[];
    },
  };
}
```

- [ ] **Step 4: Deletar `characterBossRepo`**

```bash
git rm backend/src/db/repositories/characterBossRepo.ts
```

---

### Task 3: `ProgressionService` por conta + testes

**Files:**
- Modify: `backend/src/modules/progression/progression.service.ts`
- Modify: `backend/src/modules/progression/progression.controller.ts`
- Modify: `backend/src/modules/progression/progression.router.ts`
- Modify: `backend/tests/fakes/fakeRepos.ts`
- Modify: `backend/tests/progression.test.ts`

**Interfaces:**
- Consumes: `UserRepo`, `UserBossRepo`, `BossRepo` (Task 2).
- Produces: `ProgressionService` com `award/revoke/history/setCompletions(usuarioId, …)`. Rotas `GET /me/bosses`, `PUT /me/bosses`, `POST /admin/users/:id/bosses`, `DELETE /admin/users/:id/bosses/:bossId`.

- [ ] **Step 1: Reescrever o service**

Substituir `backend/src/modules/progression/progression.service.ts` por:
```ts
import type { UserRepo } from '../../db/repositories/userRepo';
import type { BossRepo } from '../../db/repositories/bossRepo';
import type { UserBossRepo, CompletedBossRow } from '../../db/repositories/userBossRepo';
import { NotFoundError } from '../../common/errors/AppError';

type Deps = { userRepo: UserRepo; bossRepo: BossRepo; userBossRepo: UserBossRepo };

export function createProgressionService(deps: Deps) {
  async function recomputeTotal(usuarioId: number): Promise<number> {
    const bossIds = await deps.userBossRepo.listBossIds(usuarioId);
    const bosses = await deps.bossRepo.findByIds(bossIds);
    const total = bosses.reduce((s, b) => s + b.points, 0);
    await deps.userRepo.updateTotalPoints(usuarioId, total);
    return total;
  }

  async function ensureExists(usuarioId: number) {
    if (!(await deps.userRepo.findById(usuarioId))) throw new NotFoundError('Usuário não encontrado');
  }

  return {
    async award(usuarioId: number, bossIds: number[]): Promise<{ awarded: number; total_points: number }> {
      await ensureExists(usuarioId);
      const existing = new Set(await deps.userBossRepo.listBossIds(usuarioId));
      const validBosses = await deps.bossRepo.findByIds([...new Set(bossIds)]);
      const toAdd = validBosses.map((b) => b.id).filter((id) => !existing.has(id));
      await deps.userBossRepo.insertMany(usuarioId, toAdd);
      const total_points = await recomputeTotal(usuarioId);
      return { awarded: toAdd.length, total_points };
    },
    async revoke(usuarioId: number, bossId: number): Promise<{ total_points: number }> {
      await ensureExists(usuarioId);
      await deps.userBossRepo.deleteOne(usuarioId, bossId);
      return { total_points: await recomputeTotal(usuarioId) };
    },
    async history(usuarioId: number): Promise<CompletedBossRow[]> {
      await ensureExists(usuarioId);
      return deps.userBossRepo.listWithBoss(usuarioId);
    },
    async setCompletions(usuarioId: number, bossIds: number[]): Promise<{ awarded: number; removed: number; total_points: number }> {
      await ensureExists(usuarioId);
      const validIds = (await deps.bossRepo.findByIds([...new Set(bossIds)])).map((b) => b.id);
      const desired = new Set(validIds);
      const current = new Set(await deps.userBossRepo.listBossIds(usuarioId));
      const toAdd = [...desired].filter((id) => !current.has(id));
      const toRemove = [...current].filter((id) => !desired.has(id));
      await deps.userBossRepo.insertMany(usuarioId, toAdd);
      for (const id of toRemove) await deps.userBossRepo.deleteOne(usuarioId, id);
      const total_points = await recomputeTotal(usuarioId);
      return { awarded: toAdd.length, removed: toRemove.length, total_points };
    },
  };
}

export type ProgressionService = ReturnType<typeof createProgressionService>;
```

- [ ] **Step 2: Controller — admin por usuário + rotas `/me`**

Substituir `backend/src/modules/progression/progression.controller.ts` por:
```ts
import type { Request, Response } from 'express';
import type { ProgressionService } from './progression.service';

export function createProgressionController(progressionService: ProgressionService) {
  return {
    // admin: alvo é um usuário (:id)
    async award(req: Request, res: Response) {
      const { bossIds } = req.body as { bossIds: number[] };
      res.json(await progressionService.award(Number(req.params.id), bossIds));
    },
    async revoke(req: Request, res: Response) {
      res.json(await progressionService.revoke(Number(req.params.id), Number(req.params.bossId)));
    },
    // conta do próprio usuário logado
    async myHistory(req: Request, res: Response) {
      res.json(await progressionService.history(req.user!.sub));
    },
    async setMine(req: Request, res: Response) {
      const { bossIds } = req.body as { bossIds: number[] };
      res.json(await progressionService.setCompletions(req.user!.sub, bossIds));
    },
  };
}
```

- [ ] **Step 3: Router — `/me/bosses` + `/admin/users/:id/bosses`**

Substituir o corpo de `createProgressionRouter` em `backend/src/modules/progression/progression.router.ts`:
```ts
const bossIdsSchema = z.object({ bossIds: z.array(z.number().int().positive()) });

export function createProgressionRouter(progressionService: ProgressionService): Router {
  const c = createProgressionController(progressionService);
  const r = Router();
  r.get('/me/bosses', requireAuth, wrap(c.myHistory));
  r.put('/me/bosses', requireAuth, validate({ body: bossIdsSchema }), wrap(c.setMine));
  r.post('/admin/users/:id/bosses', requireAuth, requireAdmin, validate({ params: idParam, body: awardSchema }), wrap(c.award));
  r.delete('/admin/users/:id/bosses/:bossId', requireAuth, requireAdmin, validate({ params: idBossParam }), wrap(c.revoke));
  return r;
}
```
(mantém os `awardSchema`, `idParam`, `idBossParam`, `wrap` já existentes.)

- [ ] **Step 4: Atualizar os fakes**

Em `backend/tests/fakes/fakeRepos.ts`:
- Trocar o import da linha 5 de `characterBossRepo` para:
```ts
import type { UserBossRepo, CompletedBossRow } from '../../src/db/repositories/userBossRepo';
```
- Em `makeFakeUserRepo`: no `upsertByDiscordId`, criar `rec` com `total_points: 0`:
```ts
      const rec: UserRecord = { id: seq++, ...p, total_points: 0, push_enabled: true };
```
  e adicionar o método:
```ts
    async updateTotalPoints(id, total) { const u = users.find((x) => x.id === id); if (u) u.total_points = total; },
```
- Em `makeFakePersonagemRepo`: `create` vira `const rec: PersonagemRecord = { id: seq++, ...p };` (sem `total_points: 0`) e **remover** o método `updateTotalPoints`.
- Substituir `makeFakeCharacterBossRepo` por:
```ts
export function makeFakeUserBossRepo(bossRepo: BossRepo): UserBossRepo {
  const completed = new Map<number, Set<number>>(); // usuarioId -> bossIds
  return {
    async listBossIds(uid) { return [...(completed.get(uid) ?? new Set<number>())]; },
    async insertMany(uid, bossIds) {
      const set = completed.get(uid) ?? new Set<number>();
      bossIds.forEach((b) => set.add(b));
      completed.set(uid, set);
    },
    async deleteOne(uid, bossId) { completed.get(uid)?.delete(bossId); },
    async listWithBoss(uid) {
      const ids = [...(completed.get(uid) ?? new Set<number>())];
      const bosses = await bossRepo.findByIds(ids);
      return bosses.map((b) => ({ boss_id: b.id, operation: b.operation, boss: b.boss, difficulty: b.difficulty, type: b.type, points: b.points, completed_at: new Date(0) })) as CompletedBossRow[];
    },
  };
}
```
- Em `makeFakeRaidPlayerRepo`, mudar a assinatura para aceitar `userRepo` opcional e ler os pontos da conta no roster:
```ts
export function makeFakeRaidPlayerRepo(personagemRepo: PersonagemRepo, userRepo?: UserRepo): RaidPlayerRepo {
```
  e dentro do `listRoster`, trocar a montagem de `total_points`:
```ts
        const u = userRepo ? await userRepo.findById(r.usuario_id) : null;
        out.push({ usuario_id: r.usuario_id, username: 'u' + r.usuario_id, avatar: null, personagem_id: r.personagem_id, nome: p?.nome ?? '?', classe: p?.classe ?? '?', especializacao: p?.especializacao ?? null, role: r.role, item_level: p?.item_level ?? 0, total_points: u?.total_points ?? 0, status: r.status, joined_at: r.joined_at });
```

- [ ] **Step 5: Reescrever `progression.test.ts` (conta)**

Substituir `backend/tests/progression.test.ts` por:
```ts
import { makeFakeUserRepo, makeFakeBossRepo, makeFakeUserBossRepo } from './fakes/fakeRepos';
import { createProgressionService } from '../src/modules/progression/progression.service';

async function setup() {
  const userRepo = makeFakeUserRepo();
  const bossRepo = makeFakeBossRepo();
  const userBossRepo = makeFakeUserBossRepo(bossRepo);
  const u = await userRepo.upsertByDiscordId({ discord_id: 'd1', username: 'Kira', nickname: null, avatar: null, email: null, role: 'user' });
  const svc = createProgressionService({ userRepo, bossRepo, userBossRepo });
  return { svc, userRepo, uid: u.id };
}

describe('progression (conta)', () => {
  it('award soma pontos e é idempotente', async () => {
    const { svc, userRepo, uid } = await setup();
    const r1 = await svc.award(uid, [1, 2, 3]);
    expect(r1.awarded).toBe(3);
    expect(r1.total_points).toBe(3);
    const r2 = await svc.award(uid, [1, 2, 3]);
    expect(r2.awarded).toBe(0);
    expect(r2.total_points).toBe(3);
    expect((await userRepo.findById(uid))!.total_points).toBe(3);
  });

  it('revoke recalcula o total', async () => {
    const { svc, uid } = await setup();
    await svc.award(uid, [1, 2, 3]);
    expect((await svc.revoke(uid, 2)).total_points).toBe(2);
  });

  it('history lista os bosses concluídos', async () => {
    const { svc, uid } = await setup();
    await svc.award(uid, [1, 2]);
    expect(await svc.history(uid)).toHaveLength(2);
  });

  it('ignora boss_id inexistente', async () => {
    const { svc, uid } = await setup();
    const r = await svc.award(uid, [999999]);
    expect(r.awarded).toBe(0);
    expect(r.total_points).toBe(0);
  });
});
```

- [ ] **Step 6: Rodar os testes de progressão**

```bash
cd backend && npx vitest run tests/progression.test.ts
```
Esperado: 4 passam.

---

### Task 4: `characters.service` deriva Tier dos pontos da conta

**Files:**
- Modify: `backend/src/modules/characters/characters.service.ts`
- Modify: `backend/src/modules/characters/characters.controller.ts`
- Modify: `backend/src/modules/characters/characters.router.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/characters.routes.test.ts`, `backend/tests/charactersValidation.test.ts`, `backend/tests/progressionSelf.test.ts`

**Interfaces:**
- Consumes: `UserRepo.findById().total_points`.
- Produces: `CharacterView = PersonagemRecord & { total_points: number; tier: number; pointsToNextTier: number | null }`, onde `total_points` é o da **conta** (igual em todos os chars). `createCharacterService` passa a receber `userRepo`. `createCharactersRouter(characterService)` deixa de receber `progressionService`.

- [ ] **Step 1: `characters.service` — pontos da conta na view**

Em `backend/src/modules/characters/characters.service.ts`:
- Import: adicionar `import type { UserRepo } from '../../db/repositories/userRepo';`.
- Trocar o tipo e a função `view`:
```ts
export type CharacterView = PersonagemRecord & { total_points: number; tier: number; pointsToNextTier: number | null };

const view = (p: PersonagemRecord, points: number): CharacterView => ({
  ...p, total_points: points, tier: calcularTier(points), pointsToNextTier: pointsToNextTier(points),
});
```
- Assinatura: `export function createCharacterService(deps: { personagemRepo: PersonagemRepo; raidPlayerRepo: RaidPlayerRepo; userRepo: UserRepo }) {`.
- Adicionar helper dentro do service:
```ts
  async function pointsOf(usuarioId: number): Promise<number> {
    return (await deps.userRepo.findById(usuarioId))?.total_points ?? 0;
  }
```
- Ajustar os retornos:
  - `create`: `return view(created, await pointsOf(usuarioId));`
  - `list`: `const pts = await pointsOf(usuarioId); return (await deps.personagemRepo.findByUsuario(usuarioId)).map((p) => view(p, pts));`
  - `get`: `const p = await deps.personagemRepo.findById(id); if (!p) throw new NotFoundError('Personagem não encontrado'); return view(p, await pointsOf(p.usuario_id));`
  - `update`: `return view(merged, await pointsOf(actorId));`

- [ ] **Step 2: Controller e router de characters — sem progression**

Em `backend/src/modules/characters/characters.controller.ts`:
- Remover o import de `ProgressionService`, o segundo parâmetro `progressionService` da factory, e os métodos `history` e `setBosses`.
- Assinatura: `export function createCharactersController(characterService: CharacterService) {`.

Em `backend/src/modules/characters/characters.router.ts`:
- Remover o import de `ProgressionService`, o `bossIdsSchema`, o segundo parâmetro, e as duas rotas `/characters/:id/history` e `/characters/:id/bosses`.
- Assinatura: `export function createCharactersRouter(characterService: CharacterService): Router {` e `const c = createCharactersController(characterService);`.

- [ ] **Step 3: Wire-up em `app.ts`**

Em `backend/src/app.ts`, dentro do bloco `if (deps.characterService && deps.progressionService)`:
```ts
    app.use('/', createCharactersRouter(deps.characterService));
    app.use('/', createProgressionRouter(deps.progressionService));
```

- [ ] **Step 4: Wire-up em `server.ts`**

Em `backend/src/server.ts`:
- Trocar o import `createCharacterBossRepo` por `createUserBossRepo` (de `./db/repositories/userBossRepo`).
- Linha 51: `const userBossRepo = createUserBossRepo(db);` (no lugar de `charBossRepo`).
- Linha 55: `const characterService = createCharacterService({ personagemRepo, raidPlayerRepo, userRepo });`.
- Linha 56: `const progressionService = createProgressionService({ userRepo, bossRepo, userBossRepo });`.

- [ ] **Step 5: Ajustar os testes de characters**

Em `backend/tests/characters.routes.test.ts` e `backend/tests/charactersValidation.test.ts`: onde constroem `createCharacterService({ personagemRepo, raidPlayerRepo })`, adicionar `userRepo` (criar via `makeFakeUserRepo` e, se os testes usam `usuario_id: N`, dar `upsert` de um usuário com esse id — o fake atribui ids sequenciais a partir de 1). Adicionar `import { makeFakeUserRepo } from './fakes/fakeRepos';` se faltar. Rodar cada arquivo e corrigir conforme o compilador/asserts.

- [ ] **Step 6: Reescrever `progressionSelf.test.ts` para `/me/bosses`**

Substituir `backend/tests/progressionSelf.test.ts` por:
```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakePersonagemRepo, makeFakeBossRepo, makeFakeUserBossRepo, makeFakeRaidPlayerRepo } from './fakes/fakeRepos';
import { createCharacterService } from '../src/modules/characters/characters.service';
import { createProgressionService } from '../src/modules/progression/progression.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

async function build() {
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const userBossRepo = makeFakeUserBossRepo(bossRepo);
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo, userRepo);
  const characterService = createCharacterService({ personagemRepo, raidPlayerRepo, userRepo });
  const progressionService = createProgressionService({ userRepo, bossRepo, userBossRepo });
  const app = createApp({ authService: {} as any, characterService, progressionService, bossRepo });
  const u = await userRepo.upsertByDiscordId({ discord_id: 'd1', username: 'Kira', nickname: null, avatar: null, email: null, role: 'user' });
  const p = await personagemRepo.create({ usuario_id: u.id, nome: 'Kira', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });
  return { app, uid: u.id, charId: p.id };
}
const tok = (sub: number) => signAccessToken({ sub, role: 'user' });

describe('auto-report PUT /me/bosses (conta)', () => {
  it('sincroniza bosses e o total/tier da conta acompanha (visível no personagem)', async () => {
    const { app, uid, charId } = await build();
    const r1 = await request(app).put('/me/bosses').set('Authorization', `Bearer ${tok(uid)}`)
      .send({ bossIds: Array.from({ length: 26 }, (_, i) => i + 1) });
    expect(r1.status).toBe(200);
    expect(r1.body.total_points).toBe(26);
    const g1 = await request(app).get(`/characters/${charId}`).set('Authorization', `Bearer ${tok(uid)}`);
    expect(g1.body.total_points).toBe(26);
    expect(g1.body.tier).toBe(1);
    const r2 = await request(app).put('/me/bosses').set('Authorization', `Bearer ${tok(uid)}`)
      .send({ bossIds: [1, 2, 3] });
    expect(r2.status).toBe(200);
    const g2 = await request(app).get(`/characters/${charId}`).set('Authorization', `Bearer ${tok(uid)}`);
    expect(g2.body.total_points).toBe(3);
  });

  it('requer autenticação', async () => {
    const { app } = await build();
    const res = await request(app).put('/me/bosses').send({ bossIds: [1] });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 7: Rodar os testes afetados**

```bash
cd backend && npx vitest run tests/progressionSelf.test.ts tests/characters.routes.test.ts tests/charactersValidation.test.ts
```
Esperado: todos passam.

---

### Task 5: Gate de join, roster e Discord pela conta

**Files:**
- Modify: `backend/src/modules/raids/raidJoin.service.ts`
- Modify: `backend/src/db/repositories/raidPlayerRepo.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/tests/raidJoin.test.ts`, `backend/tests/raidService.test.ts`, `backend/tests/raidFull.routes.test.ts`, `backend/tests/raids.routes.test.ts`, `backend/tests/components.test.ts` (os que exercitam tier/roster)

**Interfaces:**
- Consumes: `UserRepo.findById().total_points`.
- Produces: `createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo, userRepo })`; `listRoster` seleciona `usuarios.total_points`.

- [ ] **Step 1: `raidPlayerRepo.listRoster` — pontos da conta**

Em `backend/src/db/repositories/raidPlayerRepo.ts`, no `listRoster`, trocar a linha do select:
```ts
          'usuarios.total_points as total_points', 'raid_players.status as status', 'raid_players.joined_at as joined_at',
```
(era `'personagens.total_points as total_points'`; o join com `usuarios` já existe.)

- [ ] **Step 2: `raidJoin.service` — gate pela conta**

Em `backend/src/modules/raids/raidJoin.service.ts`:
- Import: `import type { UserRepo } from '../../db/repositories/userRepo';`.
- `type Deps`: adicionar `userRepo: UserRepo`.
- No `join`, trocar o cálculo do tier:
```ts
      const user = await deps.userRepo.findById(actorId);
      const tier = calcularTier(user?.total_points ?? 0);
```
(remove o uso de `pers.total_points`; `pers` continua sendo usado para facção/role.)

- [ ] **Step 3: Wire-up em `server.ts`**

Linha 59: `const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo, userRepo });`.

- [ ] **Step 4: Discord `components.ts` já usa `user.total_points`**

Verificar: `handleJoinClick` usa `calcularTier(c.total_points)` (linha 53/66) sobre o **personagem**. Trocar para o usuário:
```ts
  const eligible = chars.filter((c) => c.faccao === detail.faction && calcularTier(user.total_points) >= detail.minimum_tier);
  ...
    options: eligible.map((c) => ({
      label: `${c.nome} — ${c.role} (${c.faccao}, Tier ${calcularTier(user.total_points)})`,
      value: String(c.id),
    })),
```
(`user` já vem de `actorFor` e agora carrega `total_points`.)

- [ ] **Step 5: Ajustar os testes de raid/discord**

Nos testes que montam `createRaidJoinService(...)`, adicionar `userRepo`; onde antes davam tier ao personagem via `total_points`, agora dão via `userRepo.updateTotalPoints(uid, N)` (ou upsert + update) e passam `userRepo` ao `makeFakeRaidPlayerRepo(personagemRepo, userRepo)`. Em `components.test.ts`, garantir que o usuário do `upsertByDiscordId` tenha `total_points` suficiente (via `updateTotalPoints`) para o char ficar elegível. Rodar cada arquivo e corrigir os asserts de tier/roster para a nova fonte.

- [ ] **Step 6: Rodar a suíte inteira do backend**

```bash
cd backend && npm run typecheck && npx vitest run
```
Esperado: typecheck limpo e **todos** os testes passam. Corrigir qualquer arquivo que ainda referencie `character_bosses`/`total_points` de personagem.

- [ ] **Step 7: Commit do backend**

```bash
git add backend/src backend/tests
git commit -m "feat(backend): Tier/progressao por conta (usuario_bosses, /me/bosses, gate e roster pela conta)"
```

---

### Task 6: `/me` expõe `total_points` + `tier`

**Files:**
- Modify: `backend/src/modules/users/users.controller.ts`
- Modify: `backend/tests/users.routes.test.ts`

**Interfaces:**
- Produces: `GET /me` retorna `{ ...user, total_points, tier, pointsToNextTier }`.

- [ ] **Step 1: Enriquecer o `/me`**

Em `backend/src/modules/users/users.controller.ts`:
- Import: `import { calcularTier, pointsToNextTier } from '../../common/progression/tier';`.
- `me`:
```ts
    async me(req: Request, res: Response) {
      const u = await userService.getMe(req.user!.sub);
      res.json({ ...u, tier: calcularTier(u.total_points), pointsToNextTier: pointsToNextTier(u.total_points) });
    },
```

- [ ] **Step 2: Teste do `/me`**

Em `backend/tests/users.routes.test.ts`, adicionar/ajustar um caso: após upsert de um usuário e `updateTotalPoints(id, 26)`, `GET /me` retorna `total_points: 26`, `tier: 1`, `pointsToNextTier: 25`. Rodar:
```bash
cd backend && npx vitest run tests/users.routes.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/users backend/tests/users.routes.test.ts
git commit -m "feat(backend): GET /me expõe total_points/tier/pointsToNextTier da conta"
```

---

### Task 7: Flutter — `TierBadge` (badge colorido reutilizável)

**Files:**
- Create: `app/lib/core/ui/tier_badge.dart`

**Interfaces:**
- Produces: `TierBadge(tier: int)` widget + `Color tierColor(int tier)`; paleta fria→quente.

- [ ] **Step 1: Criar o widget**

Criar `app/lib/core/ui/tier_badge.dart`:
```dart
import 'package:flutter/material.dart';
import 'holo_palette.dart';

/// Cor do Tier (fria→quente): 0 cinza, 1–2 azul, 3–4 violeta (marca), 5 dourado, 6 glow.
Color tierColor(int tier) {
  switch (tier) {
    case 1:
    case 2:
      return HoloPalette.blue;
    case 3:
    case 4:
      return HoloPalette.indigo;
    case 5:
      return HoloPalette.gold;
    case 6:
      return HoloPalette.dps; // ápice quente
    default:
      return HoloPalette.faint;
  }
}

class TierBadge extends StatelessWidget {
  final int tier;
  final bool compact;
  const TierBadge({super.key, required this.tier, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final c = tierColor(tier);
    final label = tier == 0 ? 'Sem Tier' : 'Tier $tier';
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 10, vertical: compact ? 3 : 5),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withValues(alpha: 0.55)),
        boxShadow: tier >= 6 ? [BoxShadow(color: c.withValues(alpha: 0.45), blurRadius: 10)] : null,
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'Aldrich', fontSize: compact ? 10 : 12, letterSpacing: 0.5,
          color: c, fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
```
> `withValues(alpha:)` é a API atual (evita o `withOpacity` deprecado). Se o `flutter analyze` acusar versão antiga, trocar por `.withOpacity(...)`.

- [ ] **Step 2: Verificar compilação**

```powershell
cd app; flutter analyze lib/core/ui/tier_badge.dart
```
Esperado: sem erros.

---

### Task 8: Flutter — tela de progressão da conta + item no menu

**Files:**
- Create: `app/lib/features/profile/me_progression_screen.dart`
- Delete: `app/lib/features/characters/character_progression_screen.dart`
- Modify: `app/lib/core/nav/nav_destinations.dart`
- Modify: `app/lib/core/router/app_router.dart`
- Modify: `app/lib/features/characters/character_profile_screen.dart`

**Interfaces:**
- Consumes: `GET /me/bosses`, `PUT /me/bosses`, `GET /reference/bosses`.
- Produces: rota `/progression` + destino de menu "Progressão".

- [ ] **Step 1: Criar a tela de progressão da conta**

Criar `app/lib/features/profile/me_progression_screen.dart` (mesma lógica da antiga, endereçada à conta):
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';

class MeProgressionScreen extends ConsumerStatefulWidget {
  const MeProgressionScreen({super.key});
  @override
  ConsumerState<MeProgressionScreen> createState() => _State();
}

class _State extends ConsumerState<MeProgressionScreen> {
  Map<String, List<Map<String, dynamic>>> _byOp = {};
  final Set<int> _checked = {};
  bool _loading = true, _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final cat = await api.dio.get('/reference/bosses');
    final mine = await api.dio.get('/me/bosses');
    final byOp = <String, List<Map<String, dynamic>>>{};
    for (final b in (cat.data['bosses'] as List)) {
      final m = (b as Map).cast<String, dynamic>();
      byOp.putIfAbsent(m['operation'] as String, () => []).add(m);
    }
    setState(() {
      _byOp = byOp;
      _checked.addAll((mine.data as List).map((e) => (e as Map)['boss_id'] as int));
      _loading = false;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final api = ref.read(apiClientProvider);
    await api.dio.put('/me/bosses', data: {'bossIds': _checked.toList()});
    if (mounted) { setState(() => _saving = false); context.pop(); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Minha progressão PvE'),
        actions: [TextButton(onPressed: _saving ? null : _save, child: Text(_saving ? '...' : 'Salvar'))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: _byOp.entries.map((entry) => ExpansionTile(
                title: Text(entry.key),
                children: entry.value.map((b) {
                  final bid = b['id'] as int;
                  final diff = b['difficulty'] ?? b['type'];
                  return CheckboxListTile(
                    dense: true,
                    value: _checked.contains(bid),
                    title: Text('${b['boss']} · $diff'),
                    onChanged: (v) => setState(() => v == true ? _checked.add(bid) : _checked.remove(bid)),
                  );
                }).toList(),
              )).toList(),
            ),
    );
  }
}
```

- [ ] **Step 2: Menu lateral — destino "Progressão"**

Em `app/lib/core/nav/nav_destinations.dart`, na lista de `navDestinations`, adicionar após Personagens:
```dart
      const NavDestination(route: '/progression', label: 'Progressão', icon: Icons.checklist, color: HoloPalette.gold),
```

- [ ] **Step 3: Rotas — trocar progression por conta**

Em `app/lib/core/router/app_router.dart`:
- Trocar o import de `character_progression_screen.dart` por `import '../../features/profile/me_progression_screen.dart';`.
- Remover a `GoRoute` de `/characters/:id/progression`.
- Adicionar: `GoRoute(path: '/progression', builder: (_, _) => const MeProgressionScreen()),`.

- [ ] **Step 4: Remover a antiga tela e o botão por personagem**

```bash
git rm app/lib/features/characters/character_progression_screen.dart
```
Em `app/lib/features/characters/character_profile_screen.dart`: remover o `OutlinedButton.icon` "Marcar bosses" (linhas 33–37) e a seção "Histórico" + o `FutureBuilder` que chama `ref.read(charactersRepositoryProvider).history(id)` (linhas 45–63, mais o import não usado se sobrar). Trocar o `Chip(label: Text(c.tier == 0 ? 'Sem Tier' : 'Tier ${c.tier}'))` por `TierBadge(tier: c.tier)` e importar `../../core/ui/tier_badge.dart`.

- [ ] **Step 5: Remover `history` do repositório de characters**

Em `app/lib/features/characters/characters_repository.dart`, remover o método `history` (o endpoint `/characters/:id/history` não existe mais).

- [ ] **Step 6: Analisar**

```powershell
cd app; flutter analyze
```
Esperado: sem erros (corrigir imports órfãos).

---

### Task 9: Flutter — Tier da conta no perfil, lista e roster

**Files:**
- Modify: `app/lib/features/profile/profile_screen.dart`
- Modify: `app/lib/features/characters/characters_list_screen.dart`
- Modify: `app/lib/features/raids/raid_detail_screen.dart`

**Interfaces:**
- Consumes: `/me` (`total_points`, `tier`, `pointsToNextTier`), `TierBadge`.

- [ ] **Step 1: Perfil — Tier da conta direto**

Em `app/lib/features/profile/profile_screen.dart`:
- Importar `../../core/ui/tier_badge.dart`.
- Substituir o bloco `chars.when(...)` (linhas 63–78) por um card que usa os valores de `me`:
```dart
              Builder(builder: (context) {
                final pts = (me['total_points'] as int?) ?? 0;
                final tier = (me['tier'] as int?) ?? 0;
                final next = me['pointsToNextTier'] as int?;
                final progress = next == null ? 1.0 : (pts / (pts + next)).clamp(0.0, 1.0);
                return Card(child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      TierBadge(tier: tier),
                      const Spacer(),
                      Text('$pts pontos', style: Theme.of(context).textTheme.bodyMedium),
                    ]),
                    const SizedBox(height: 10),
                    LinearProgressIndicator(value: progress),
                    const SizedBox(height: 6),
                    Text(next != null ? 'faltam $next para o próximo Tier' : 'Tier máximo!',
                        style: Theme.of(context).textTheme.bodySmall),
                  ]),
                ));
              }),
```
- Remover o `chars` (`ref.watch(charactersProvider)`) e o helper `_mini` se ficarem sem uso, e o import de `characters_providers.dart`/`holo_palette.dart` se órfãos.

- [ ] **Step 2: Lista de personagens — badge de conta**

Em `app/lib/features/characters/characters_list_screen.dart`: importar `../../core/ui/tier_badge.dart` e trocar o `trailing` `Column`:
```dart
                        trailing: TierBadge(tier: c.tier, compact: true),
```
(remove o `Chip` + `Text('${c.totalPoints} pts')` — o ponto agora é da conta e aparece no perfil/menu.)

- [ ] **Step 3: Roster / sign — badge de conta**

Em `app/lib/features/raids/raid_detail_screen.dart`:
- Importar `../../core/ui/tier_badge.dart`.
- `_playerTile`: trocar `trailing: Chip(label: Text(r.tier == 0 ? 'Sem Tier' : 'Tier ${r.tier}'))` por `trailing: TierBadge(tier: r.tier, compact: true)`.
- No bottom sheet do `_join` (linha 103), trocar o `subtitle` do char por `Text(c.tier == 0 ? 'Sem Tier' : 'Tier ${c.tier}')` — permanece válido (o `c.tier` já é o da conta). Opcional: usar `TierBadge`.
- O filtro de elegibilidade (`c.faccao == raid.faction && c.tier >= raid.minimumTier`) permanece — `c.tier` agora é o Tier da conta, igual em todos os chars.

- [ ] **Step 4: Analisar e rodar os widget tests**

```powershell
cd app; flutter analyze; flutter test
```
Esperado: sem erros; os widget tests existentes (form + raid_detail gating) continuam passando (acham botões por texto; o `TierBadge` não os quebra).

- [ ] **Step 5: Commit do Flutter**

```bash
git add app/lib app/test
git commit -m "feat(app): Tier por conta (TierBadge, menu Progressão, perfil/roster/lista usam Tier da conta)"
```

---

### Task 10: Smoke real da migração + wrap-up

**Files:** nenhum (verificação).

- [ ] **Step 1: Aplicar a migration no MySQL local**

Pré-condição: banco `holoraid` com as migrations 001–007 aplicadas e (idealmente) algum `character_bosses` semeado em ≥2 personagens da mesma conta para provar a união.
```bash
cd backend && npm run migrate
```
Esperado: `008_account_tier` aplica sem erro.

- [ ] **Step 2: Provar a união e os pontos**

Com o cliente MySQL, para um usuário com dois personagens que tinham bosses sobrepostos, conferir:
- `SELECT COUNT(*) FROM usuario_bosses WHERE usuario_id = ?` = quantidade **distinta** de bosses somando os dois chars.
- `SELECT total_points FROM usuarios WHERE id = ?` = soma de `bosses.points` sobre esse conjunto distinto.
- `SHOW TABLES LIKE 'character_bosses'` = vazio; `SHOW COLUMNS FROM personagens LIKE 'total_points'` = vazio.

- [ ] **Step 3: Smoke de ponta a ponta (opcional, app rodando)**

Marcar bosses em `/progression`, confirmar o Tier no Perfil e no roster ao entrar numa raid.

- [ ] **Step 4: Suíte completa final**

```bash
cd backend && npm run typecheck && npx vitest run
```
Esperado: verde. Atualizar a memória `holoraid-project-state.md` com o subsistema "Tier por conta" concluído.

---

## Self-Review

- **Cobertura da spec:** modelo de dados (Task 1–2), service/endpoints (Task 3–6), Flutter telas+badge (Task 7–9), migração destrutiva com smoke (Task 1+Task 10). ✔
- **Placeholders:** nenhum "TBD/TODO"; todo passo com código ou comando concreto. ✔
- **Consistência de tipos:** `total_points` sai de `PersonagemRecord`, entra em `UserRecord` e volta em `CharacterView` (como ponto da conta); `UserBossRepo`/`makeFakeUserBossRepo` usam `usuarioId`; `createCharacterService`/`createRaidJoinService` recebem `userRepo`; `createCharactersRouter` perde `progressionService`. ✔
- **Ambiguidade:** o gate de join e o roster leem `usuarios.total_points`; a facção continua por personagem. ✔
- **Risco:** migração destrutiva — a união (Steps 3–4 da migration) roda antes dos drops (Step 5), e o smoke da Task 10 valida os números antes de considerar concluído. ✔
