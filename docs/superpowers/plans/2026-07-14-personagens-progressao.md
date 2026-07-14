# Personagens & Progressão PvE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar personagens (CRUD), progressão PvE idempotente e Tier derivado ao RaidSync, com telas Flutter, sobre a fundação do #1.

**Architecture:** Segue o padrão do #1 — módulos por feature (router → controller → service → repository), services com repositórios injetados, `createApp(deps)` estendida para montar os routers novos com repos falsos nos testes (sem MySQL). Dados de classe/disciplina/role como constantes TS; bosses seedados no DB. Tier puramente derivado de `total_points`.

**Tech Stack:** Node/TypeScript, Express, Kysely + mysql2, Zod, vitest + supertest (backend); Flutter (Riverpod, GoRouter, Dio) — tudo já instalado no #1.

## Global Constraints

- **1 ponto por objetivo**; SM = 0; total possível = **105 = Tier 6**. Um teste valida `SUM(points) === 105`.
- **classe** = Combat Style (16); **especializacao** = Disciplina (48, opcional, define a role); **origin_story** opcional; **role** ∈ Tank/Healer/DPS.
- Validação cross-field: `classe`∈faccao, `discipline`∈classe & `discipline.role===role`, `role`∈allowedRoles(classe), `origin_story`===originStory(classe).
- **Tier nunca é coluna**; derivado via `calcularTier(total_points)`: `>=105→6, >=100→5, >=90→4, >=76→3, >=51→2, >=26→1, senão 0`.
- Escrita **owner-only** (403 se `usuario_id !== req.user.sub`); award/revoke **admin**.
- Dados de referência (classes/disciplinas/bosses) verbatim dos **Apêndices A–C da spec** `docs/superpowers/specs/2026-07-14-personagens-progressao-design.md`.
- Backend TS: `npm run build` e `npm run typecheck` sempre limpos; Flutter: `flutter analyze` limpo.

---

## Mapa de arquivos (novos)

```
backend/src/
  reference/
    swtor.ts            # FACTIONS, ROLES, COMBAT_STYLES(16), DISCIPLINES(48) + helpers
    bossesSeed.ts       # BOSSES_SEED (105) + helpers de expansão
  common/progression/
    tier.ts             # calcularTier + pointsToNextTier
  db/
    schema.ts           # (MODIFICAR) +personagens, bosses, character_bosses
    migrations/002_personagens.ts   # cria tabelas + seed bosses
    repositories/personagemRepo.ts
    repositories/bossRepo.ts
    repositories/characterBossRepo.ts
  modules/
    characters/
      characters.schemas.ts     # Zod + superRefine
      characters.service.ts     # CRUD + ownership
      characters.controller.ts
      characters.router.ts
    progression/
      progression.service.ts    # award/revoke/history (reusado pelo #3)
      progression.controller.ts # rotas admin
      progression.router.ts
    reference/
      reference.controller.ts
      reference.router.ts
  app.ts               # (MODIFICAR) monta reference/characters/progression routers
  server.ts            # (MODIFICAR) instancia repos/services reais
backend/tests/
  tier.test.ts, reference.test.ts, charactersValidation.test.ts,
  characters.routes.test.ts, progression.test.ts
  fakes/fakeRepos.ts   # (MODIFICAR) + fakes de personagem/boss/characterBoss

app/lib/
  core/reference/reference_models.dart, reference_providers.dart
  features/characters/
    character_model.dart, characters_repository.dart, characters_providers.dart
    characters_list_screen.dart, character_form_screen.dart, character_profile_screen.dart
  core/router/app_router.dart   # (MODIFICAR) + rotas /characters
```

---

# FASE A — Backend

### Task 1: Constantes de referência SWTOR

**Files:**
- Create: `backend/src/reference/swtor.ts`
- Test: `backend/tests/reference.test.ts` (parte 1)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Faction = 'Republic'|'Empire'`, `type Role = 'Tank'|'Healer'|'DPS'`.
  - `FACTIONS: Faction[]`, `ROLES: Role[]`.
  - `interface CombatStyle { name: string; faccao: Faction; originStory: string; allowedRoles: Role[] }`, `COMBAT_STYLES: CombatStyle[]` (16).
  - `interface Discipline { name: string; combatStyle: string; role: Role; mirror: string }`, `DISCIPLINES: Discipline[]` (48).
  - `combatStyleByName(name): CombatStyle | undefined`, `disciplinesOfStyle(style): Discipline[]`, `disciplineByName(name): Discipline | undefined`.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/reference.test.ts`

```ts
import { COMBAT_STYLES, DISCIPLINES, combatStyleByName, disciplinesOfStyle } from '../src/reference/swtor';

describe('reference swtor', () => {
  it('tem 16 combat styles e 48 disciplinas', () => {
    expect(COMBAT_STYLES).toHaveLength(16);
    expect(DISCIPLINES).toHaveLength(48);
  });

  it('cada disciplina pertence a um combat style existente', () => {
    const names = new Set(COMBAT_STYLES.map((c) => c.name));
    for (const d of DISCIPLINES) expect(names.has(d.combatStyle)).toBe(true);
  });

  it('Guardian permite Tank e DPS; tem 3 disciplinas', () => {
    expect(combatStyleByName('Guardian')?.allowedRoles).toEqual(['Tank', 'DPS']);
    expect(disciplinesOfStyle('Guardian').map((d) => d.name)).toEqual(['Defense', 'Vigilance', 'Focus']);
  });

  it('roles das disciplinas: 6 Tank, 6 Healer, 36 DPS', () => {
    const by = (r: string) => DISCIPLINES.filter((d) => d.role === r).length;
    expect(by('Tank')).toBe(6);
    expect(by('Healer')).toBe(6);
    expect(by('DPS')).toBe(36);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/reference.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/reference/swtor.ts`** (dados verbatim dos Apêndices A–B da spec)

```ts
export type Faction = 'Republic' | 'Empire';
export type Role = 'Tank' | 'Healer' | 'DPS';

export const FACTIONS: Faction[] = ['Republic', 'Empire'];
export const ROLES: Role[] = ['Tank', 'Healer', 'DPS'];

export interface CombatStyle {
  name: string;
  faccao: Faction;
  originStory: string;
  allowedRoles: Role[];
}

export const COMBAT_STYLES: CombatStyle[] = [
  { name: 'Guardian', faccao: 'Republic', originStory: 'Jedi Knight', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Sentinel', faccao: 'Republic', originStory: 'Jedi Knight', allowedRoles: ['DPS'] },
  { name: 'Sage', faccao: 'Republic', originStory: 'Jedi Consular', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Shadow', faccao: 'Republic', originStory: 'Jedi Consular', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Commando', faccao: 'Republic', originStory: 'Trooper', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Vanguard', faccao: 'Republic', originStory: 'Trooper', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Gunslinger', faccao: 'Republic', originStory: 'Smuggler', allowedRoles: ['DPS'] },
  { name: 'Scoundrel', faccao: 'Republic', originStory: 'Smuggler', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Juggernaut', faccao: 'Empire', originStory: 'Sith Warrior', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Marauder', faccao: 'Empire', originStory: 'Sith Warrior', allowedRoles: ['DPS'] },
  { name: 'Sorcerer', faccao: 'Empire', originStory: 'Sith Inquisitor', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Assassin', faccao: 'Empire', originStory: 'Sith Inquisitor', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Mercenary', faccao: 'Empire', originStory: 'Bounty Hunter', allowedRoles: ['Healer', 'DPS'] },
  { name: 'Powertech', faccao: 'Empire', originStory: 'Bounty Hunter', allowedRoles: ['Tank', 'DPS'] },
  { name: 'Sniper', faccao: 'Empire', originStory: 'Imperial Agent', allowedRoles: ['DPS'] },
  { name: 'Operative', faccao: 'Empire', originStory: 'Imperial Agent', allowedRoles: ['Healer', 'DPS'] },
];

export interface Discipline {
  name: string;
  combatStyle: string;
  role: Role;
  mirror: string;
}

// [name, role, mirror] por combat style
const disc = (combatStyle: string, rows: [string, Role, string][]): Discipline[] =>
  rows.map(([name, role, mirror]) => ({ name, combatStyle, role, mirror }));

export const DISCIPLINES: Discipline[] = [
  ...disc('Guardian', [['Defense', 'Tank', 'Immortal'], ['Vigilance', 'DPS', 'Vengeance'], ['Focus', 'DPS', 'Rage']]),
  ...disc('Sentinel', [['Watchman', 'DPS', 'Annihilation'], ['Combat', 'DPS', 'Carnage'], ['Concentration', 'DPS', 'Fury']]),
  ...disc('Sage', [['Seer', 'Healer', 'Corruption'], ['Telekinetics', 'DPS', 'Lightning'], ['Balance', 'DPS', 'Madness']]),
  ...disc('Shadow', [['Kinetic Combat', 'Tank', 'Darkness'], ['Infiltration', 'DPS', 'Deception'], ['Serenity', 'DPS', 'Hatred']]),
  ...disc('Commando', [['Combat Medic', 'Healer', 'Bodyguard'], ['Gunnery', 'DPS', 'Arsenal'], ['Assault Specialist', 'DPS', 'Innovative Ordnance']]),
  ...disc('Vanguard', [['Shield Specialist', 'Tank', 'Shield Tech'], ['Tactics', 'DPS', 'Advanced Prototype'], ['Plasmatech', 'DPS', 'Pyrotech']]),
  ...disc('Gunslinger', [['Sharpshooter', 'DPS', 'Marksmanship'], ['Saboteur', 'DPS', 'Engineering'], ['Dirty Fighting', 'DPS', 'Virulence']]),
  ...disc('Scoundrel', [['Sawbones', 'Healer', 'Medicine'], ['Scrapper', 'DPS', 'Concealment'], ['Ruffian', 'DPS', 'Lethality']]),
  ...disc('Juggernaut', [['Immortal', 'Tank', 'Defense'], ['Vengeance', 'DPS', 'Vigilance'], ['Rage', 'DPS', 'Focus']]),
  ...disc('Marauder', [['Annihilation', 'DPS', 'Watchman'], ['Carnage', 'DPS', 'Combat'], ['Fury', 'DPS', 'Concentration']]),
  ...disc('Sorcerer', [['Corruption', 'Healer', 'Seer'], ['Lightning', 'DPS', 'Telekinetics'], ['Madness', 'DPS', 'Balance']]),
  ...disc('Assassin', [['Darkness', 'Tank', 'Kinetic Combat'], ['Deception', 'DPS', 'Infiltration'], ['Hatred', 'DPS', 'Serenity']]),
  ...disc('Mercenary', [['Bodyguard', 'Healer', 'Combat Medic'], ['Arsenal', 'DPS', 'Gunnery'], ['Innovative Ordnance', 'DPS', 'Assault Specialist']]),
  ...disc('Powertech', [['Shield Tech', 'Tank', 'Shield Specialist'], ['Advanced Prototype', 'DPS', 'Tactics'], ['Pyrotech', 'DPS', 'Plasmatech']]),
  ...disc('Sniper', [['Marksmanship', 'DPS', 'Sharpshooter'], ['Engineering', 'DPS', 'Saboteur'], ['Virulence', 'DPS', 'Dirty Fighting']]),
  ...disc('Operative', [['Medicine', 'Healer', 'Sawbones'], ['Concealment', 'DPS', 'Scrapper'], ['Lethality', 'DPS', 'Ruffian']]),
];

export function combatStyleByName(name: string): CombatStyle | undefined {
  return COMBAT_STYLES.find((c) => c.name === name);
}
export function disciplinesOfStyle(style: string): Discipline[] {
  return DISCIPLINES.filter((d) => d.combatStyle === style);
}
export function disciplineByName(name: string): Discipline | undefined {
  return DISCIPLINES.find((d) => d.name === name);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/reference.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/reference/swtor.ts backend/tests/reference.test.ts
git commit -m "feat(reference): constantes SWTOR (16 combat styles, 48 disciplinas)"
```

---

### Task 2: Seed de bosses (105 pontos)

**Files:**
- Create: `backend/src/reference/bossesSeed.ts`
- Test: `backend/tests/reference.test.ts` (parte 2 — adicionar ao arquivo)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type BossType = 'boss'|'timer'|'lair'`, `type Difficulty = 'Veteran'|'Master'`.
  - `interface BossSeed { operation: string; boss: string; difficulty: Difficulty | null; type: BossType; points: number }`.
  - `BOSSES_SEED: BossSeed[]` (105 linhas somando 105 pontos).

- [ ] **Step 1: Adicionar teste** ao final de `backend/tests/reference.test.ts`

```ts
import { BOSSES_SEED } from '../src/reference/bossesSeed';

describe('bosses seed', () => {
  it('soma exatamente 105 pontos (invariante do Tier 6)', () => {
    expect(BOSSES_SEED.reduce((s, b) => s + b.points, 0)).toBe(105);
  });

  it('contagem por tipo: boss=88, timer=8, lair=9', () => {
    const by = (t: string) => BOSSES_SEED.filter((b) => b.type === t).reduce((s, b) => s + b.points, 0);
    expect(by('boss')).toBe(88);
    expect(by('timer')).toBe(8);
    expect(by('lair')).toBe(9);
  });

  it('timers não têm dificuldade', () => {
    expect(BOSSES_SEED.filter((b) => b.type === 'timer').every((b) => b.difficulty === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/reference.test.ts`
Expected: FAIL — `bossesSeed` não existe.

- [ ] **Step 3: Implementar `backend/src/reference/bossesSeed.ts`** (dados verbatim do Apêndice C)

```ts
export type BossType = 'boss' | 'timer' | 'lair';
export type Difficulty = 'Veteran' | 'Master';

export interface BossSeed {
  operation: string;
  boss: string;
  difficulty: Difficulty | null;
  type: BossType;
  points: number;
}

// Bosses com Veteran E Master (2 linhas, 1 ponto cada)
const both = (operation: string, bosses: string[]): BossSeed[] =>
  bosses.flatMap((boss) => [
    { operation, boss, difficulty: 'Veteran' as const, type: 'boss' as const, points: 1 },
    { operation, boss, difficulty: 'Master' as const, type: 'boss' as const, points: 1 },
  ]);

// Bosses só Veteran (Master N/A)
const vet = (operation: string, bosses: string[]): BossSeed[] =>
  bosses.map((boss) => ({ operation, boss, difficulty: 'Veteran' as const, type: 'boss' as const, points: 1 }));

const timer = (operation: string): BossSeed => ({ operation, boss: 'Timer', difficulty: null, type: 'timer', points: 1 });

const lair = (name: string, difficulty: Difficulty): BossSeed => ({
  operation: name, boss: name, difficulty, type: 'lair', points: 1,
});

export const BOSSES_SEED: BossSeed[] = [
  // type 'boss' — Veteran + Master
  ...both('Explosive Conflict', ['Zorn & Toth', 'Tanks', 'Minefield', 'Kephess']),
  ...both('Terror From Beyond', ['Writhing Horror', 'Dread Guards', 'Operator IX', 'Kephess', 'Terror From Beyond']),
  ...both('Scum and Villainy', ['Dash', 'Titan 6', 'Thrasher', 'Operations Chief', 'Olok', 'Warlords', 'Styrak']),
  ...both('Dread Fortress', ['Nefra', 'Draxus', "Grob'Thok", 'Corrupter Zero', 'Brontes']),
  ...both('Dread Palace', ['Bestia', 'Tyrans', 'Calphayus', 'Raptus', 'Council']),
  ...both('Dxun', ['Red', 'Lights Out', 'According to Plan', 'Trandoshans', 'Huntmaster', 'Apex']),
  ...both('Gods from the Machine', ['Tyth', 'Aivela & Esne', 'Nahut', 'Scyva', 'Izax']),
  // type 'boss' — só Veteran
  ...vet('R-4 Anomaly', ['IP-CPT', 'Watchdog', 'Kanoth', 'Lady Dominique']),
  ...vet('Ravagers', ['Sparky', 'Quartermaster', 'Torque', 'Master & Blaster', 'Coratanni']),
  ...vet('Temple of Sacrifice', ['Malaphar', 'Sword Squadrons', 'Underlurker', 'Revanite Commander', 'Revan']),
  // type 'timer'
  timer('Explosive Conflict'), timer('Terror From Beyond'), timer('Scum and Villainy'),
  timer('Dread Palace'), timer('Dread Fortress'), timer('Dxun'),
  timer('Gods from the Machine'), timer('R-4 Anomaly'),
  // type 'lair'
  lair('Monolith', 'Veteran'), lair('Hive Queen', 'Veteran'),
  { operation: 'XR-53', boss: 'XR-53', difficulty: 'Veteran', type: 'lair', points: 1 },
  { operation: 'XR-53', boss: 'XR-53', difficulty: 'Master', type: 'lair', points: 1 },
  lair('Golden Fury', 'Veteran'), lair('Eyeless', 'Veteran'), lair('Xeno', 'Veteran'),
  lair('Hateful Entity', 'Master'), lair('Dreadful Entity', 'Veteran'),
];
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/reference.test.ts`
Expected: PASS (7 testes no total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/reference/bossesSeed.ts backend/tests/reference.test.ts
git commit -m "feat(reference): seed de bosses (105 pontos, invariante testado)"
```

---

### Task 3: Cálculo de Tier

**Files:**
- Create: `backend/src/common/progression/tier.ts`
- Test: `backend/tests/tier.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `calcularTier(points: number): number` (0..6).
  - `pointsToNextTier(points: number): number | null` (pontos faltando p/ o próximo Tier; `null` se já no Tier 6).

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/tier.test.ts`

```ts
import { calcularTier, pointsToNextTier } from '../src/common/progression/tier';

describe('calcularTier', () => {
  it.each([
    [0, 0], [25, 0], [26, 1], [50, 1], [51, 2], [75, 2],
    [76, 3], [89, 3], [90, 4], [99, 4], [100, 5], [104, 5], [105, 6], [999, 6],
  ])('points=%i -> tier %i', (points, tier) => {
    expect(calcularTier(points)).toBe(tier);
  });
});

describe('pointsToNextTier', () => {
  it('0 pontos faltam 26 para o Tier 1', () => expect(pointsToNextTier(0)).toBe(26));
  it('90 pontos faltam 10 para o Tier 5', () => expect(pointsToNextTier(90)).toBe(10));
  it('105 pontos: já no máximo (null)', () => expect(pointsToNextTier(105)).toBeNull());
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/tier.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/common/progression/tier.ts`**

```ts
const THRESHOLDS = [26, 51, 76, 90, 100, 105]; // limiares dos Tiers 1..6

export function calcularTier(points: number): number {
  if (points >= 105) return 6;
  if (points >= 100) return 5;
  if (points >= 90) return 4;
  if (points >= 76) return 3;
  if (points >= 51) return 2;
  if (points >= 26) return 1;
  return 0;
}

export function pointsToNextTier(points: number): number | null {
  const next = THRESHOLDS.find((t) => points < t);
  return next === undefined ? null : next - points;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/tier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/progression/tier.ts backend/tests/tier.test.ts
git commit -m "feat(progression): calcularTier + pointsToNextTier (regra fixa)"
```

---

### Task 4: Schema + migration (tabelas + seed de bosses)

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/db/migrations/002_personagens.ts`

**Interfaces:**
- Consumes: `BOSSES_SEED` (Task 2), `DB` (schema do #1).
- Produces: tabelas `personagens`, `bosses`, `character_bosses` + tipos no `DB`; migration que cria as tabelas e insere `BOSSES_SEED`.

> Verificado por compilação; migration ao vivo é integração (precisa de MySQL).

- [ ] **Step 1: Adicionar tipos em `backend/src/db/schema.ts`** (antes de `export interface DB`)

```ts
export interface PersonagensTable {
  id: Generated<number>;
  usuario_id: number;
  nome: string;
  faccao: 'Republic' | 'Empire';
  classe: string;
  especializacao: string | null;
  role: 'Tank' | 'Healer' | 'DPS';
  origin_story: string | null;
  item_level: number;
  total_points: number;
  created_at: Created;
  updated_at: Updated;
}

export interface BossesTable {
  id: Generated<number>;
  operation: string;
  boss: string;
  difficulty: 'Veteran' | 'Master' | null;
  type: 'boss' | 'timer' | 'lair';
  points: number;
}

export interface CharacterBossesTable {
  id: Generated<number>;
  personagem_id: number;
  boss_id: number;
  completed_at: ColumnType<Date, Date | string, never>;
}
```

E acrescentar ao `interface DB`:

```ts
  personagens: PersonagensTable;
  bosses: BossesTable;
  character_bosses: CharacterBossesTable;
```

- [ ] **Step 2: Verificar compilação**

Run: `cd backend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Implementar `backend/src/db/migrations/002_personagens.ts`**

```ts
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
```

- [ ] **Step 4: Verificar compilação**

Run: `cd backend && npm run build`
Expected: exit 0.

- [ ] **Step 5: (Integração — precisa de MySQL) rodar a migration**

Run: `cd backend && npm run migrate`
Expected: `OK: 002_personagens`; `SELECT COUNT(*) FROM bosses` = 105.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.ts backend/src/db/migrations/002_personagens.ts
git commit -m "feat(db): tabelas personagens/bosses/character_bosses + seed de bosses"
```

---

### Task 5: Repositórios + fakes

**Files:**
- Create: `backend/src/db/repositories/personagemRepo.ts`
- Create: `backend/src/db/repositories/bossRepo.ts`
- Create: `backend/src/db/repositories/characterBossRepo.ts`
- Modify: `backend/tests/fakes/fakeRepos.ts`

**Interfaces:**
- Consumes: `db`/`DB` (schema).
- Produces:
  - `type PersonagemRecord = { id, usuario_id, nome, faccao, classe, especializacao, role, origin_story, item_level, total_points }`; `type PersonagemInput = Omit<PersonagemRecord,'id'|'total_points'>`.
  - `interface PersonagemRepo { create(p:PersonagemInput):Promise<PersonagemRecord>; findById(id):Promise<PersonagemRecord|null>; findByUsuario(u):Promise<PersonagemRecord[]>; update(id, patch:Partial<PersonagemInput>):Promise<void>; delete(id):Promise<void>; updateTotalPoints(id,total):Promise<void> }` + `createPersonagemRepo(db)`.
  - `type BossRecord = { id, operation, boss, difficulty:'Veteran'|'Master'|null, type:'boss'|'timer'|'lair', points }`; `interface BossRepo { list():Promise<BossRecord[]>; findByIds(ids:number[]):Promise<BossRecord[]> }` + `createBossRepo(db)`.
  - `type CompletedBossRow = { boss_id, operation, boss, difficulty, type, points, completed_at:Date }`; `interface CharacterBossRepo { listBossIds(pid):Promise<number[]>; insertMany(pid, bossIds:number[]):Promise<void>; deleteOne(pid, bossId):Promise<void>; listWithBoss(pid):Promise<CompletedBossRow[]> }` + `createCharacterBossRepo(db)`.
  - Fakes: `makeFakePersonagemRepo()`, `makeFakeBossRepo(seed?:BossRecord[])`, `makeFakeCharacterBossRepo()`.

- [ ] **Step 1: Implementar `backend/src/db/repositories/personagemRepo.ts`**

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Faccao = 'Republic' | 'Empire';
export type Role = 'Tank' | 'Healer' | 'DPS';
export type PersonagemRecord = {
  id: number; usuario_id: number; nome: string; faccao: Faccao; classe: string;
  especializacao: string | null; role: Role; origin_story: string | null;
  item_level: number; total_points: number;
};
export type PersonagemInput = Omit<PersonagemRecord, 'id' | 'total_points'>;

export interface PersonagemRepo {
  create(p: PersonagemInput): Promise<PersonagemRecord>;
  findById(id: number): Promise<PersonagemRecord | null>;
  findByUsuario(usuarioId: number): Promise<PersonagemRecord[]>;
  update(id: number, patch: Partial<PersonagemInput>): Promise<void>;
  delete(id: number): Promise<void>;
  updateTotalPoints(id: number, total: number): Promise<void>;
}

const COLS = ['id', 'usuario_id', 'nome', 'faccao', 'classe', 'especializacao', 'role', 'origin_story', 'item_level', 'total_points'] as const;

export function createPersonagemRepo(db: Kysely<DB>): PersonagemRepo {
  return {
    async create(p) {
      const res = await db.insertInto('personagens').values({ ...p, total_points: 0, updated_at: new Date() }).executeTakeFirstOrThrow();
      const id = Number(res.insertId);
      const row = await db.selectFrom('personagens').select(COLS).where('id', '=', id).executeTakeFirstOrThrow();
      return row as PersonagemRecord;
    },
    async findById(id) {
      const row = await db.selectFrom('personagens').select(COLS).where('id', '=', id).executeTakeFirst();
      return (row as PersonagemRecord) ?? null;
    },
    async findByUsuario(usuarioId) {
      const rows = await db.selectFrom('personagens').select(COLS).where('usuario_id', '=', usuarioId).orderBy('id').execute();
      return rows as PersonagemRecord[];
    },
    async update(id, patch) {
      await db.updateTable('personagens').set({ ...patch, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async delete(id) {
      await db.deleteFrom('personagens').where('id', '=', id).execute();
    },
    async updateTotalPoints(id, total) {
      await db.updateTable('personagens').set({ total_points: total, updated_at: new Date() }).where('id', '=', id).execute();
    },
  };
}
```

- [ ] **Step 2: Implementar `backend/src/db/repositories/bossRepo.ts`**

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type BossRecord = {
  id: number; operation: string; boss: string;
  difficulty: 'Veteran' | 'Master' | null; type: 'boss' | 'timer' | 'lair'; points: number;
};

export interface BossRepo {
  list(): Promise<BossRecord[]>;
  findByIds(ids: number[]): Promise<BossRecord[]>;
}

const COLS = ['id', 'operation', 'boss', 'difficulty', 'type', 'points'] as const;

export function createBossRepo(db: Kysely<DB>): BossRepo {
  return {
    async list() {
      const rows = await db.selectFrom('bosses').select(COLS).orderBy('id').execute();
      return rows as BossRecord[];
    },
    async findByIds(ids) {
      if (ids.length === 0) return [];
      const rows = await db.selectFrom('bosses').select(COLS).where('id', 'in', ids).execute();
      return rows as BossRecord[];
    },
  };
}
```

- [ ] **Step 3: Implementar `backend/src/db/repositories/characterBossRepo.ts`**

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type CompletedBossRow = {
  boss_id: number; operation: string; boss: string;
  difficulty: 'Veteran' | 'Master' | null; type: 'boss' | 'timer' | 'lair'; points: number; completed_at: Date;
};

export interface CharacterBossRepo {
  listBossIds(personagemId: number): Promise<number[]>;
  insertMany(personagemId: number, bossIds: number[]): Promise<void>;
  deleteOne(personagemId: number, bossId: number): Promise<void>;
  listWithBoss(personagemId: number): Promise<CompletedBossRow[]>;
}

export function createCharacterBossRepo(db: Kysely<DB>): CharacterBossRepo {
  return {
    async listBossIds(personagemId) {
      const rows = await db.selectFrom('character_bosses').select('boss_id').where('personagem_id', '=', personagemId).execute();
      return rows.map((r) => r.boss_id);
    },
    async insertMany(personagemId, bossIds) {
      if (bossIds.length === 0) return;
      await db.insertInto('character_bosses')
        .values(bossIds.map((boss_id) => ({ personagem_id: personagemId, boss_id, completed_at: new Date() })))
        .execute();
    },
    async deleteOne(personagemId, bossId) {
      await db.deleteFrom('character_bosses')
        .where('personagem_id', '=', personagemId).where('boss_id', '=', bossId).execute();
    },
    async listWithBoss(personagemId) {
      const rows = await db.selectFrom('character_bosses')
        .innerJoin('bosses', 'bosses.id', 'character_bosses.boss_id')
        .select(['character_bosses.boss_id as boss_id', 'bosses.operation', 'bosses.boss', 'bosses.difficulty', 'bosses.type', 'bosses.points', 'character_bosses.completed_at'])
        .where('character_bosses.personagem_id', '=', personagemId)
        .orderBy('bosses.operation')
        .execute();
      return rows as CompletedBossRow[];
    },
  };
}
```

- [ ] **Step 4: Adicionar fakes em `backend/tests/fakes/fakeRepos.ts`** (append)

```ts
import type { PersonagemRepo, PersonagemRecord, PersonagemInput } from '../../src/db/repositories/personagemRepo';
import type { BossRepo, BossRecord } from '../../src/db/repositories/bossRepo';
import type { CharacterBossRepo, CompletedBossRow } from '../../src/db/repositories/characterBossRepo';
import { BOSSES_SEED } from '../../src/reference/bossesSeed';

export function makeFakePersonagemRepo(): PersonagemRepo {
  const rows: PersonagemRecord[] = [];
  let seq = 1;
  return {
    async create(p: PersonagemInput) {
      const rec: PersonagemRecord = { id: seq++, total_points: 0, ...p };
      rows.push(rec);
      return { ...rec };
    },
    async findById(id) { return rows.find((r) => r.id === id) ?? null; },
    async findByUsuario(u) { return rows.filter((r) => r.usuario_id === u).map((r) => ({ ...r })); },
    async update(id, patch) { const r = rows.find((x) => x.id === id); if (r) Object.assign(r, patch); },
    async delete(id) { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows.splice(i, 1); },
    async updateTotalPoints(id, total) { const r = rows.find((x) => x.id === id); if (r) r.total_points = total; },
  };
}

// Fake bosses com ids 1..N a partir do seed (mesma ordem)
export function makeFakeBossRepo(): BossRepo {
  const rows: BossRecord[] = BOSSES_SEED.map((b, i) => ({ id: i + 1, ...b }));
  return {
    async list() { return rows.map((r) => ({ ...r })); },
    async findByIds(ids) { return rows.filter((r) => ids.includes(r.id)).map((r) => ({ ...r })); },
  };
}

export function makeFakeCharacterBossRepo(bossRepo: BossRepo): CharacterBossRepo {
  const completed = new Map<number, Set<number>>(); // personagemId -> bossIds
  return {
    async listBossIds(pid) { return [...(completed.get(pid) ?? new Set())]; },
    async insertMany(pid, bossIds) {
      const set = completed.get(pid) ?? new Set<number>();
      bossIds.forEach((b) => set.add(b));
      completed.set(pid, set);
    },
    async deleteOne(pid, bossId) { completed.get(pid)?.delete(bossId); },
    async listWithBoss(pid) {
      const ids = [...(completed.get(pid) ?? new Set())];
      const bosses = await bossRepo.findByIds(ids);
      return bosses.map((b) => ({ boss_id: b.id, operation: b.operation, boss: b.boss, difficulty: b.difficulty, type: b.type, points: b.points, completed_at: new Date(0) })) as CompletedBossRow[];
    },
  };
}
```

- [ ] **Step 5: Verificar compilação**

Run: `cd backend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/repositories/personagemRepo.ts backend/src/db/repositories/bossRepo.ts backend/src/db/repositories/characterBossRepo.ts backend/tests/fakes/fakeRepos.ts
git commit -m "feat(db): repositórios de personagem/boss/character_boss + fakes"
```

---

### Task 6: Validação de personagem (Zod cross-field)

**Files:**
- Create: `backend/src/modules/characters/characters.schemas.ts`
- Test: `backend/tests/charactersValidation.test.ts`

**Interfaces:**
- Consumes: `COMBAT_STYLES`, `DISCIPLINES`, helpers (Task 1), `ROLES`/`FACTIONS`.
- Produces:
  - `createCharacterSchema` (Zod) validando nome/faccao/classe/especializacao/role/origin_story/item_level com `.superRefine` cross-field.
  - `updateCharacterSchema` (todos opcionais, mesma coerência quando presentes).
  - `type CreateCharacterInput = z.infer<...>`.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/charactersValidation.test.ts`

```ts
import { createCharacterSchema } from '../src/modules/characters/characters.schemas';

const base = { nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 };

describe('createCharacterSchema', () => {
  it('aceita caminho feliz sem disciplina', () => {
    expect(createCharacterSchema.safeParse(base).success).toBe(true);
  });

  it('aceita com disciplina coerente', () => {
    const r = createCharacterSchema.safeParse({ ...base, especializacao: 'Defense' });
    expect(r.success).toBe(true);
  });

  it('rejeita combat style de outra facção', () => {
    const r = createCharacterSchema.safeParse({ ...base, classe: 'Juggernaut' }); // Empire
    expect(r.success).toBe(false);
  });

  it('rejeita role não permitida pela classe', () => {
    const r = createCharacterSchema.safeParse({ ...base, classe: 'Sentinel', role: 'Tank' }); // Sentinel só DPS
    expect(r.success).toBe(false);
  });

  it('rejeita disciplina fora da classe', () => {
    const r = createCharacterSchema.safeParse({ ...base, especializacao: 'Immortal' }); // Immortal é Juggernaut
    expect(r.success).toBe(false);
  });

  it('rejeita disciplina cuja role diverge da role escolhida', () => {
    const r = createCharacterSchema.safeParse({ ...base, classe: 'Guardian', role: 'DPS', especializacao: 'Defense' }); // Defense é Tank
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/charactersValidation.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/modules/characters/characters.schemas.ts`**

```ts
import { z } from 'zod';
import { FACTIONS, ROLES, combatStyleByName, disciplineByName } from '../../reference/swtor';

const fields = {
  nome: z.string().trim().min(1).max(64),
  faccao: z.enum(FACTIONS as [string, ...string[]]),
  classe: z.string().min(1),
  especializacao: z.string().min(1).nullish(),
  role: z.enum(ROLES as [string, ...string[]]),
  origin_story: z.string().min(1).nullish(),
  item_level: z.number().int().min(0).max(10000),
};

function refine(data: any, ctx: z.RefinementCtx) {
  const style = combatStyleByName(data.classe);
  if (!style) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classe'], message: 'Combat Style inexistente' });
    return;
  }
  if (style.faccao !== data.faccao) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classe'], message: 'Combat Style não pertence à facção' });
  }
  if (!style.allowedRoles.includes(data.role)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'Role não permitida para a classe' });
  }
  if (data.origin_story && data.origin_story !== style.originStory) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['origin_story'], message: 'Origin Story não bate com a classe' });
  }
  if (data.especializacao) {
    const disc = disciplineByName(data.especializacao);
    if (!disc || disc.combatStyle !== data.classe) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['especializacao'], message: 'Disciplina não pertence à classe' });
    } else if (disc.role !== data.role) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['especializacao'], message: 'Role da disciplina diverge da role escolhida' });
    }
  }
}

export const createCharacterSchema = z.object(fields).superRefine(refine);
export const updateCharacterSchema = z.object({
  nome: fields.nome.optional(),
  faccao: fields.faccao.optional(),
  classe: fields.classe.optional(),
  especializacao: fields.especializacao,
  role: fields.role.optional(),
  origin_story: fields.origin_story,
  item_level: fields.item_level.optional(),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
```

> **Nota:** `updateCharacterSchema` valida formato; a coerência cross-field no update é reaplicada no service sobre o registro mesclado (Task 7), porque um PATCH parcial pode combinar campos novos com os existentes.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/charactersValidation.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/characters/characters.schemas.ts backend/tests/charactersValidation.test.ts
git commit -m "feat(characters): validação Zod cross-field (facção/classe/disciplina/role)"
```

---

### Task 7: CharacterService (CRUD + posse)

**Files:**
- Create: `backend/src/modules/characters/characters.service.ts`
- Test: `backend/tests/characters.routes.test.ts` (parte service — via rotas na Task 9; aqui um teste unitário de posse)

**Interfaces:**
- Consumes: `PersonagemRepo` (Task 5), `calcularTier`/`pointsToNextTier` (Task 3), `combatStyleByName`/`disciplineByName` (Task 1), erros do #1.
- Produces `createCharacterService({ personagemRepo })`:
  - `create(usuarioId, input): Promise<CharacterView>`
  - `list(usuarioId): Promise<CharacterView[]>`
  - `get(id): Promise<CharacterView>` (qualquer; `NotFoundError` se não existe)
  - `update(actorId, id, patch): Promise<CharacterView>` (posse → `ForbiddenError`; revalida coerência do registro mesclado → `ValidationError`)
  - `remove(actorId, id): Promise<void>` (posse)
  - `type CharacterView = PersonagemRecord & { tier: number; pointsToNextTier: number | null }`.

- [ ] **Step 1: Implementar `backend/src/modules/characters/characters.service.ts`**

```ts
import type { PersonagemRepo, PersonagemRecord, PersonagemInput } from '../../db/repositories/personagemRepo';
import { calcularTier, pointsToNextTier } from '../../common/progression/tier';
import { combatStyleByName, disciplineByName } from '../../reference/swtor';
import { NotFoundError, ForbiddenError, ValidationError } from '../../common/errors/AppError';

export type CharacterView = PersonagemRecord & { tier: number; pointsToNextTier: number | null };

const view = (p: PersonagemRecord): CharacterView => ({
  ...p, tier: calcularTier(p.total_points), pointsToNextTier: pointsToNextTier(p.total_points),
});

// Revalida coerência cross-field (usado no update sobre o registro mesclado).
function assertCoerente(p: Pick<PersonagemRecord, 'faccao' | 'classe' | 'role' | 'especializacao' | 'origin_story'>) {
  const style = combatStyleByName(p.classe);
  if (!style || style.faccao !== p.faccao) throw new ValidationError('Combat Style inválido para a facção');
  if (!style.allowedRoles.includes(p.role)) throw new ValidationError('Role não permitida para a classe');
  if (p.origin_story && p.origin_story !== style.originStory) throw new ValidationError('Origin Story não bate com a classe');
  if (p.especializacao) {
    const disc = disciplineByName(p.especializacao);
    if (!disc || disc.combatStyle !== p.classe) throw new ValidationError('Disciplina não pertence à classe');
    if (disc.role !== p.role) throw new ValidationError('Role da disciplina diverge da role');
  }
}

export function createCharacterService(deps: { personagemRepo: PersonagemRepo }) {
  async function owned(actorId: number, id: number): Promise<PersonagemRecord> {
    const p = await deps.personagemRepo.findById(id);
    if (!p) throw new NotFoundError('Personagem não encontrado');
    if (p.usuario_id !== actorId) throw new ForbiddenError('Personagem de outro usuário');
    return p;
  }

  return {
    async create(usuarioId: number, input: Omit<PersonagemInput, 'usuario_id'>): Promise<CharacterView> {
      const created = await deps.personagemRepo.create({ ...input, usuario_id: usuarioId });
      return view(created);
    },
    async list(usuarioId: number): Promise<CharacterView[]> {
      return (await deps.personagemRepo.findByUsuario(usuarioId)).map(view);
    },
    async get(id: number): Promise<CharacterView> {
      const p = await deps.personagemRepo.findById(id);
      if (!p) throw new NotFoundError('Personagem não encontrado');
      return view(p);
    },
    async update(actorId: number, id: number, patch: Partial<PersonagemInput>): Promise<CharacterView> {
      const current = await owned(actorId, id);
      const merged = { ...current, ...patch } as PersonagemRecord;
      assertCoerente(merged);
      await deps.personagemRepo.update(id, patch);
      return view(merged);
    },
    async remove(actorId: number, id: number): Promise<void> {
      await owned(actorId, id);
      await deps.personagemRepo.delete(id);
    },
  };
}

export type CharacterService = ReturnType<typeof createCharacterService>;
```

- [ ] **Step 2: Verificar compilação**

Run: `cd backend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit** (testes de posse via rotas na Task 9)

```bash
git add backend/src/modules/characters/characters.service.ts
git commit -m "feat(characters): service CRUD com checagem de posse + Tier derivado"
```

---

### Task 8: ProgressionService (award/revoke/history)

**Files:**
- Create: `backend/src/modules/progression/progression.service.ts`
- Test: `backend/tests/progression.test.ts`

**Interfaces:**
- Consumes: `PersonagemRepo`, `BossRepo`, `CharacterBossRepo` (Task 5), erros do #1.
- Produces `createProgressionService({ personagemRepo, bossRepo, charBossRepo })`:
  - `award(personagemId, bossIds): Promise<{ awarded: number; total_points: number }>` — idempotente; recalcula `total_points`.
  - `revoke(personagemId, bossId): Promise<{ total_points: number }>`.
  - `history(personagemId): Promise<CompletedBossRow[]>`.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/progression.test.ts`

```ts
import { makeFakePersonagemRepo, makeFakeBossRepo, makeFakeCharacterBossRepo } from './fakes/fakeRepos';
import { createProgressionService } from '../src/modules/progression/progression.service';

async function setup() {
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const charBossRepo = makeFakeCharacterBossRepo(bossRepo);
  const p = await personagemRepo.create({
    usuario_id: 1, nome: 'Kira', faccao: 'Republic', classe: 'Guardian',
    especializacao: null, role: 'Tank', origin_story: null, item_level: 340,
  });
  const svc = createProgressionService({ personagemRepo, bossRepo, charBossRepo });
  return { svc, personagemRepo, p };
}

describe('progression', () => {
  it('award soma pontos e é idempotente', async () => {
    const { svc, personagemRepo, p } = await setup();
    const r1 = await svc.award(p.id, [1, 2, 3]); // 3 bosses de 1 ponto
    expect(r1.awarded).toBe(3);
    expect(r1.total_points).toBe(3);
    const r2 = await svc.award(p.id, [1, 2, 3]); // repetido não duplica
    expect(r2.awarded).toBe(0);
    expect(r2.total_points).toBe(3);
    expect((await personagemRepo.findById(p.id))!.total_points).toBe(3);
  });

  it('revoke recalcula o total', async () => {
    const { svc, p } = await setup();
    await svc.award(p.id, [1, 2, 3]);
    const r = await svc.revoke(p.id, 2);
    expect(r.total_points).toBe(2);
  });

  it('history lista os bosses concluídos', async () => {
    const { svc, p } = await setup();
    await svc.award(p.id, [1, 2]);
    expect(await svc.history(p.id)).toHaveLength(2);
  });

  it('ignora boss_id inexistente', async () => {
    const { svc, p } = await setup();
    const r = await svc.award(p.id, [999999]);
    expect(r.awarded).toBe(0);
    expect(r.total_points).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/progression.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/modules/progression/progression.service.ts`**

```ts
import type { PersonagemRepo } from '../../db/repositories/personagemRepo';
import type { BossRepo } from '../../db/repositories/bossRepo';
import type { CharacterBossRepo, CompletedBossRow } from '../../db/repositories/characterBossRepo';
import { NotFoundError } from '../../common/errors/AppError';

type Deps = { personagemRepo: PersonagemRepo; bossRepo: BossRepo; charBossRepo: CharacterBossRepo };

export function createProgressionService(deps: Deps) {
  async function recomputeTotal(personagemId: number): Promise<number> {
    const bossIds = await deps.charBossRepo.listBossIds(personagemId);
    const bosses = await deps.bossRepo.findByIds(bossIds);
    const total = bosses.reduce((s, b) => s + b.points, 0);
    await deps.personagemRepo.updateTotalPoints(personagemId, total);
    return total;
  }

  async function ensureExists(personagemId: number) {
    if (!(await deps.personagemRepo.findById(personagemId))) throw new NotFoundError('Personagem não encontrado');
  }

  return {
    async award(personagemId: number, bossIds: number[]): Promise<{ awarded: number; total_points: number }> {
      await ensureExists(personagemId);
      const existing = new Set(await deps.charBossRepo.listBossIds(personagemId));
      const validBosses = await deps.bossRepo.findByIds([...new Set(bossIds)]);
      const toAdd = validBosses.map((b) => b.id).filter((id) => !existing.has(id));
      await deps.charBossRepo.insertMany(personagemId, toAdd);
      const total_points = await recomputeTotal(personagemId);
      return { awarded: toAdd.length, total_points };
    },
    async revoke(personagemId: number, bossId: number): Promise<{ total_points: number }> {
      await ensureExists(personagemId);
      await deps.charBossRepo.deleteOne(personagemId, bossId);
      return { total_points: await recomputeTotal(personagemId) };
    },
    async history(personagemId: number): Promise<CompletedBossRow[]> {
      await ensureExists(personagemId);
      return deps.charBossRepo.listWithBoss(personagemId);
    },
  };
}

export type ProgressionService = ReturnType<typeof createProgressionService>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/progression.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/progression/progression.service.ts backend/tests/progression.test.ts
git commit -m "feat(progression): award idempotente + revoke + history (reusável pelo #3)"
```

---

### Task 9: Routers (reference/characters/admin) + createApp + integração

**Files:**
- Create: `backend/src/modules/reference/reference.controller.ts`
- Create: `backend/src/modules/reference/reference.router.ts`
- Create: `backend/src/modules/characters/characters.controller.ts`
- Create: `backend/src/modules/characters/characters.router.ts`
- Create: `backend/src/modules/progression/progression.controller.ts`
- Create: `backend/src/modules/progression/progression.router.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/characters.routes.test.ts`

**Interfaces:**
- Consumes: `CharacterService` (Task 7), `ProgressionService` (Task 8), `BossRepo` (Task 5), constantes (Task 1), guards/validate do #1.
- Produces:
  - `createReferenceRouter(bossRepo): Router` — `GET /reference/classes`, `GET /reference/bosses`.
  - `createCharactersRouter(characterService, progressionService): Router` — `/characters` CRUD + `GET /characters/:id/history`.
  - `createProgressionRouter(progressionService): Router` — rotas `/admin/characters/:id/bosses`.
  - `createApp` estendida: `deps` ganha `characterService?`, `progressionService?`, `bossRepo?`; monta os routers quando presentes.

- [ ] **Step 1: Escrever o teste de integração que falha** — `backend/tests/characters.routes.test.ts`

```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakePersonagemRepo, makeFakeBossRepo, makeFakeCharacterBossRepo } from './fakes/fakeRepos';
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

function build() {
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const charBossRepo = makeFakeCharacterBossRepo(bossRepo);
  const characterService = createCharacterService({ personagemRepo });
  const progressionService = createProgressionService({ personagemRepo, bossRepo, charBossRepo });
  const app = createApp({ authService: {} as any, characterService, progressionService, bossRepo });
  return { app };
}

const tokenFor = (sub: number, role: 'user' | 'admin' = 'user') => signAccessToken({ sub, role });

describe('rotas de personagens', () => {
  it('GET /reference/classes devolve 16 combat styles e 48 disciplinas', async () => {
    const res = await request(build().app).get('/reference/classes').set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(res.status).toBe(200);
    expect(res.body.combatStyles).toHaveLength(16);
    expect(res.body.disciplines).toHaveLength(48);
  });

  it('cria personagem válido e lista', async () => {
    const { app } = build();
    const t = tokenFor(1);
    const create = await request(app).post('/characters').set('Authorization', `Bearer ${t}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    expect(create.status).toBe(201);
    expect(create.body.tier).toBe(0);
    const list = await request(app).get('/characters').set('Authorization', `Bearer ${t}`);
    expect(list.body).toHaveLength(1);
  });

  it('rejeita criação incoerente (422)', async () => {
    const { app } = build();
    const res = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'X', faccao: 'Republic', classe: 'Juggernaut', role: 'Tank', item_level: 1 });
    expect(res.status).toBe(422);
  });

  it('usuário não edita personagem de outro (403)', async () => {
    const { app } = build();
    const created = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    const res = await request(app).patch(`/characters/${created.body.id}`).set('Authorization', `Bearer ${tokenFor(2)}`)
      .send({ item_level: 999 });
    expect(res.status).toBe(403);
  });

  it('admin dá award e o Tier acompanha', async () => {
    const { app } = build();
    const created = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    const id = created.body.id;
    const bossIds = Array.from({ length: 26 }, (_, i) => i + 1); // 26 pontos -> Tier 1
    const award = await request(app).post(`/admin/characters/${id}/bosses`).set('Authorization', `Bearer ${tokenFor(9, 'admin')}`)
      .send({ bossIds });
    expect(award.status).toBe(200);
    const get = await request(app).get(`/characters/${id}`).set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(get.body.total_points).toBe(26);
    expect(get.body.tier).toBe(1);
  });

  it('user comum não dá award (403)', async () => {
    const { app } = build();
    const created = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    const res = await request(app).post(`/admin/characters/${created.body.id}/bosses`).set('Authorization', `Bearer ${tokenFor(1)}`).send({ bossIds: [1] });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/characters.routes.test.ts`
Expected: FAIL — módulos/rotas não existem.

- [ ] **Step 3: Implementar `backend/src/modules/reference/reference.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { FACTIONS, ROLES, COMBAT_STYLES, DISCIPLINES } from '../../reference/swtor';
import type { BossRepo } from '../../db/repositories/bossRepo';

export function createReferenceController(bossRepo: BossRepo) {
  return {
    classes(_req: Request, res: Response) {
      const originStories = [...new Set(COMBAT_STYLES.map((c) => c.originStory))];
      res.json({ factions: FACTIONS, roles: ROLES, originStories, combatStyles: COMBAT_STYLES, disciplines: DISCIPLINES });
    },
    async bosses(_req: Request, res: Response) {
      const all = await bossRepo.list();
      const byOperation: Record<string, typeof all> = {};
      for (const b of all) (byOperation[b.operation] ??= []).push(b);
      res.json({ bosses: all, byOperation });
    },
  };
}
```

- [ ] **Step 4: Implementar `backend/src/modules/reference/reference.router.ts`**

```ts
import { Router } from 'express';
import { requireAuth } from '../../common/security/guards';
import { createReferenceController } from './reference.controller';
import type { BossRepo } from '../../db/repositories/bossRepo';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

export function createReferenceRouter(bossRepo: BossRepo): Router {
  const c = createReferenceController(bossRepo);
  const r = Router();
  r.get('/reference/classes', requireAuth, wrap(c.classes));
  r.get('/reference/bosses', requireAuth, wrap(c.bosses));
  return r;
}
```

- [ ] **Step 5: Implementar `backend/src/modules/characters/characters.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { CharacterService } from './characters.service';
import type { ProgressionService } from '../progression/progression.service';

export function createCharactersController(characterService: CharacterService, progressionService: ProgressionService) {
  return {
    async create(req: Request, res: Response) {
      const created = await characterService.create(req.user!.sub, req.body as any);
      res.status(201).json(created);
    },
    async list(req: Request, res: Response) {
      res.json(await characterService.list(req.user!.sub));
    },
    async get(req: Request, res: Response) {
      res.json(await characterService.get(Number(req.params.id)));
    },
    async update(req: Request, res: Response) {
      res.json(await characterService.update(req.user!.sub, Number(req.params.id), req.body as any));
    },
    async remove(req: Request, res: Response) {
      await characterService.remove(req.user!.sub, Number(req.params.id));
      res.status(204).send();
    },
    async history(req: Request, res: Response) {
      res.json(await progressionService.history(Number(req.params.id)));
    },
  };
}
```

- [ ] **Step 6: Implementar `backend/src/modules/characters/characters.router.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { createCharacterSchema, updateCharacterSchema } from './characters.schemas';
import { createCharactersController } from './characters.controller';
import type { CharacterService } from './characters.service';
import type { ProgressionService } from '../progression/progression.service';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);
const idParam = z.object({ id: z.coerce.number().int().positive() });

export function createCharactersRouter(characterService: CharacterService, progressionService: ProgressionService): Router {
  const c = createCharactersController(characterService, progressionService);
  const r = Router();
  r.get('/characters', requireAuth, wrap(c.list));
  r.post('/characters', requireAuth, validate({ body: createCharacterSchema }), wrap(c.create));
  r.get('/characters/:id', requireAuth, validate({ params: idParam }), wrap(c.get));
  r.patch('/characters/:id', requireAuth, validate({ params: idParam, body: updateCharacterSchema }), wrap(c.update));
  r.delete('/characters/:id', requireAuth, validate({ params: idParam }), wrap(c.remove));
  r.get('/characters/:id/history', requireAuth, validate({ params: idParam }), wrap(c.history));
  return r;
}
```

- [ ] **Step 7: Implementar `backend/src/modules/progression/progression.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { ProgressionService } from './progression.service';

export function createProgressionController(progressionService: ProgressionService) {
  return {
    async award(req: Request, res: Response) {
      const { bossIds } = req.body as { bossIds: number[] };
      res.json(await progressionService.award(Number(req.params.id), bossIds));
    },
    async revoke(req: Request, res: Response) {
      res.json(await progressionService.revoke(Number(req.params.id), Number(req.params.bossId)));
    },
  };
}
```

- [ ] **Step 8: Implementar `backend/src/modules/progression/progression.router.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { createProgressionController } from './progression.controller';
import type { ProgressionService } from './progression.service';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);
const awardSchema = z.object({ bossIds: z.array(z.number().int().positive()).min(1) });
const idParam = z.object({ id: z.coerce.number().int().positive() });
const idBossParam = z.object({ id: z.coerce.number().int().positive(), bossId: z.coerce.number().int().positive() });

export function createProgressionRouter(progressionService: ProgressionService): Router {
  const c = createProgressionController(progressionService);
  const r = Router();
  r.post('/admin/characters/:id/bosses', requireAuth, requireAdmin, validate({ params: idParam, body: awardSchema }), wrap(c.award));
  r.delete('/admin/characters/:id/bosses/:bossId', requireAuth, requireAdmin, validate({ params: idBossParam }), wrap(c.revoke));
  return r;
}
```

- [ ] **Step 9: Modificar `backend/src/app.ts`** — imports novos e montagem condicional

Adicionar imports:

```ts
import { createReferenceRouter } from './modules/reference/reference.router';
import { createCharactersRouter } from './modules/characters/characters.router';
import { createProgressionRouter } from './modules/progression/progression.router';
import type { CharacterService } from './modules/characters/characters.service';
import type { ProgressionService } from './modules/progression/progression.service';
import type { BossRepo } from './db/repositories/bossRepo';
```

Alterar a assinatura e a montagem:

```ts
export function createApp(deps: {
  authService: AuthService;
  userService?: UserService;
  characterService?: CharacterService;
  progressionService?: ProgressionService;
  bossRepo?: BossRepo;
}): Express {
```

E, logo após a montagem do users router (antes do `notFoundHandler`):

```ts
  if (deps.bossRepo) app.use('/', createReferenceRouter(deps.bossRepo));
  if (deps.characterService && deps.progressionService) {
    app.use('/', createCharactersRouter(deps.characterService, deps.progressionService));
    app.use('/', createProgressionRouter(deps.progressionService));
  }
```

- [ ] **Step 10: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/characters.routes.test.ts && npm run typecheck`
Expected: PASS (6 testes); typecheck exit 0.

- [ ] **Step 11: Rodar a suíte inteira**

Run: `cd backend && npm test`
Expected: todos verdes (inclui os do #1).

- [ ] **Step 12: Commit**

```bash
git add backend/src/modules/reference backend/src/modules/characters/characters.controller.ts backend/src/modules/characters/characters.router.ts backend/src/modules/progression/progression.controller.ts backend/src/modules/progression/progression.router.ts backend/src/app.ts backend/tests/characters.routes.test.ts
git commit -m "feat(characters): rotas reference/characters/admin + createApp estendida"
```

---

### Task 10: Bootstrap real (server.ts)

**Files:**
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: repos reais (Task 5), services (Tasks 7-8), `createApp` (Task 9), `db` (#1).
- Produces: `createApp` recebendo os services/repos reais de personagens/progressão.

- [ ] **Step 1: Modificar `backend/src/server.ts`** — instanciar repos/services novos

Adicionar imports:

```ts
import { createPersonagemRepo } from './db/repositories/personagemRepo';
import { createBossRepo } from './db/repositories/bossRepo';
import { createCharacterBossRepo } from './db/repositories/characterBossRepo';
import { createCharacterService } from './modules/characters/characters.service';
import { createProgressionService } from './modules/progression/progression.service';
```

Antes do `createApp(...)`:

```ts
const personagemRepo = createPersonagemRepo(db);
const bossRepo = createBossRepo(db);
const charBossRepo = createCharacterBossRepo(db);
const characterService = createCharacterService({ personagemRepo });
const progressionService = createProgressionService({ personagemRepo, bossRepo, charBossRepo });
```

E passar ao `createApp`:

```ts
const app = createApp({ authService, userService, characterService, progressionService, bossRepo });
```

- [ ] **Step 2: Verificar build**

Run: `cd backend && npm run build`
Expected: exit 0.

- [ ] **Step 3: (Smoke parcial, sem Discord) subir e checar reference**

Run: `cd backend && node dist/server.js &` então
`curl -s http://localhost:3010/reference/classes -H "Authorization: Bearer <token de teste>"`
> Gere um token com o mesmo JWT_SECRET do `.env` (ou reuse um teste). Alternativa: confie nos testes de integração da Task 9.
Expected: JSON com 16 combat styles.

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat(backend): wire real de personagens/progressão no bootstrap"
```

---

# FASE B — Flutter

### Task 11: Modelos + providers (reference e personagens)

**Files:**
- Create: `app/lib/core/reference/reference_models.dart`
- Create: `app/lib/core/reference/reference_providers.dart`
- Create: `app/lib/features/characters/character_model.dart`
- Create: `app/lib/features/characters/characters_repository.dart`
- Create: `app/lib/features/characters/characters_providers.dart`

**Interfaces:**
- Consumes: `apiClientProvider` (#1), Dio.
- Produces:
  - `CombatStyle`, `Discipline`, `ReferenceData` (fromJson) + `referenceProvider` (FutureProvider, cacheia `GET /reference/classes`).
  - `Character` model (fromJson, com `tier`, `pointsToNextTier`).
  - `CharactersRepository` (list/create/get/update/delete/history) usando o Dio do #1.
  - `charactersProvider` (FutureProvider da lista), `characterFormControllerProvider` (opcional).

- [ ] **Step 1: Implementar `app/lib/core/reference/reference_models.dart`**

```dart
class CombatStyle {
  final String name;
  final String faccao;
  final String originStory;
  final List<String> allowedRoles;
  CombatStyle({required this.name, required this.faccao, required this.originStory, required this.allowedRoles});
  factory CombatStyle.fromJson(Map<String, dynamic> j) => CombatStyle(
        name: j['name'] as String,
        faccao: j['faccao'] as String,
        originStory: j['originStory'] as String,
        allowedRoles: (j['allowedRoles'] as List).cast<String>(),
      );
}

class Discipline {
  final String name;
  final String combatStyle;
  final String role;
  Discipline({required this.name, required this.combatStyle, required this.role});
  factory Discipline.fromJson(Map<String, dynamic> j) =>
      Discipline(name: j['name'] as String, combatStyle: j['combatStyle'] as String, role: j['role'] as String);
}

class ReferenceData {
  final List<String> factions;
  final List<String> roles;
  final List<CombatStyle> combatStyles;
  final List<Discipline> disciplines;
  ReferenceData({required this.factions, required this.roles, required this.combatStyles, required this.disciplines});
  factory ReferenceData.fromJson(Map<String, dynamic> j) => ReferenceData(
        factions: (j['factions'] as List).cast<String>(),
        roles: (j['roles'] as List).cast<String>(),
        combatStyles: (j['combatStyles'] as List).map((e) => CombatStyle.fromJson((e as Map).cast<String, dynamic>())).toList(),
        disciplines: (j['disciplines'] as List).map((e) => Discipline.fromJson((e as Map).cast<String, dynamic>())).toList(),
      );

  List<CombatStyle> stylesOfFaction(String f) => combatStyles.where((c) => c.faccao == f).toList();
  List<Discipline> disciplinesOfStyle(String s) => disciplines.where((d) => d.combatStyle == s).toList();
}
```

- [ ] **Step 2: Implementar `app/lib/core/reference/reference_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_providers.dart';
import 'reference_models.dart';

final referenceProvider = FutureProvider<ReferenceData>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.dio.get('/reference/classes');
  return ReferenceData.fromJson((res.data as Map).cast<String, dynamic>());
});
```

- [ ] **Step 3: Implementar `app/lib/features/characters/character_model.dart`**

```dart
class Character {
  final int id;
  final String nome;
  final String faccao;
  final String classe;
  final String? especializacao;
  final String role;
  final String? originStory;
  final int itemLevel;
  final int totalPoints;
  final int tier;
  final int? pointsToNextTier;

  Character({
    required this.id, required this.nome, required this.faccao, required this.classe,
    this.especializacao, required this.role, this.originStory, required this.itemLevel,
    required this.totalPoints, required this.tier, this.pointsToNextTier,
  });

  factory Character.fromJson(Map<String, dynamic> j) => Character(
        id: j['id'] as int,
        nome: j['nome'] as String,
        faccao: j['faccao'] as String,
        classe: j['classe'] as String,
        especializacao: j['especializacao'] as String?,
        role: j['role'] as String,
        originStory: j['origin_story'] as String?,
        itemLevel: j['item_level'] as int,
        totalPoints: j['total_points'] as int,
        tier: j['tier'] as int,
        pointsToNextTier: j['pointsToNextTier'] as int?,
      );
}
```

- [ ] **Step 4: Implementar `app/lib/features/characters/characters_repository.dart`**

```dart
import '../../core/network/api_client.dart';
import 'character_model.dart';

class CharactersRepository {
  final ApiClient api;
  CharactersRepository(this.api);

  Future<List<Character>> list() async {
    final res = await api.dio.get('/characters');
    return (res.data as List).map((e) => Character.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  Future<Character> get(int id) async {
    final res = await api.dio.get('/characters/$id');
    return Character.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<Character> create(Map<String, dynamic> body) async {
    final res = await api.dio.post('/characters', data: body);
    return Character.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<Character> update(int id, Map<String, dynamic> body) async {
    final res = await api.dio.patch('/characters/$id', data: body);
    return Character.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<void> remove(int id) async => api.dio.delete('/characters/$id');

  Future<List<Map<String, dynamic>>> history(int id) async {
    final res = await api.dio.get('/characters/$id/history');
    return (res.data as List).map((e) => (e as Map).cast<String, dynamic>()).toList();
  }
}
```

- [ ] **Step 5: Implementar `app/lib/features/characters/characters_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import 'character_model.dart';
import 'characters_repository.dart';

final charactersRepositoryProvider = Provider<CharactersRepository>((ref) => CharactersRepository(ref.watch(apiClientProvider)));

final charactersProvider = FutureProvider<List<Character>>((ref) => ref.watch(charactersRepositoryProvider).list());

final characterProvider = FutureProvider.family<Character, int>((ref, id) => ref.watch(charactersRepositoryProvider).get(id));
```

- [ ] **Step 6: Verificar**

Run: `cd app && flutter analyze`
Expected: No issues found.

- [ ] **Step 7: Commit**

```bash
git add app/lib/core/reference app/lib/features/characters/character_model.dart app/lib/features/characters/characters_repository.dart app/lib/features/characters/characters_providers.dart
git commit -m "feat(app): modelos e providers de reference/personagens"
```

---

### Task 12: Tela de lista de personagens

**Files:**
- Create: `app/lib/features/characters/characters_list_screen.dart`

**Interfaces:**
- Consumes: `charactersProvider` (Task 11).
- Produces: `CharactersListScreen` — cards com nome, classe, role, chip de Tier, pontos, item level; FAB navega para o formulário; toque no card navega para o perfil.

- [ ] **Step 1: Implementar `app/lib/features/characters/characters_list_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'characters_providers.dart';

class CharactersListScreen extends ConsumerWidget {
  const CharactersListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chars = ref.watch(charactersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Meus Personagens')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/characters/new'),
        icon: const Icon(Icons.add),
        label: const Text('Novo'),
      ),
      body: chars.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (list) => list.isEmpty
            ? const Center(child: Text('Nenhum personagem ainda. Crie o primeiro!'))
            : RefreshIndicator(
                onRefresh: () async => ref.refresh(charactersProvider.future),
                child: ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final c = list[i];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: ListTile(
                        onTap: () => context.push('/characters/${c.id}'),
                        leading: CircleAvatar(child: Text(c.role[0])),
                        title: Text(c.nome),
                        subtitle: Text('${c.classe} · ${c.role} · iLvl ${c.itemLevel}'),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Chip(label: Text(c.tier == 0 ? 'Sem Tier' : 'Tier ${c.tier}')),
                            Text('${c.totalPoints} pts', style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verificar**

Run: `cd app && flutter analyze`
Expected: No issues found.

- [ ] **Step 3: Commit**

```bash
git add app/lib/features/characters/characters_list_screen.dart
git commit -m "feat(app): tela de lista de personagens"
```

---

### Task 13: Formulário de personagem (dropdowns encadeados)

**Files:**
- Create: `app/lib/features/characters/character_form_screen.dart`

**Interfaces:**
- Consumes: `referenceProvider` (Task 11), `charactersRepositoryProvider`, `charactersProvider`.
- Produces: `CharacterFormScreen` (criar) — Facção → Combat Style → (Disciplina opcional) → Role → nome + item level; ao salvar, `POST /characters`, invalida a lista e volta. Trata 422 exibindo mensagem.

- [ ] **Step 1: Implementar `app/lib/features/characters/character_form_screen.dart`**

```dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/reference/reference_providers.dart';
import '../../core/reference/reference_models.dart';
import 'characters_providers.dart';

class CharacterFormScreen extends ConsumerStatefulWidget {
  const CharacterFormScreen({super.key});
  @override
  ConsumerState<CharacterFormScreen> createState() => _CharacterFormScreenState();
}

class _CharacterFormScreenState extends ConsumerState<CharacterFormScreen> {
  final _nome = TextEditingController();
  final _itemLevel = TextEditingController(text: '340');
  String? _faccao, _classe, _disciplina, _role;
  bool _saving = false;
  String? _error;

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    try {
      await ref.read(charactersRepositoryProvider).create({
        'nome': _nome.text.trim(),
        'faccao': _faccao,
        'classe': _classe,
        if (_disciplina != null) 'especializacao': _disciplina,
        'role': _role,
        'item_level': int.tryParse(_itemLevel.text) ?? 0,
      });
      ref.invalidate(charactersProvider);
      if (mounted) context.pop();
    } on DioException catch (e) {
      setState(() => _error = e.response?.statusCode == 422 ? 'Combinação inválida de classe/role/disciplina.' : 'Falha: ${e.message}');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final refData = ref.watch(referenceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Novo Personagem')),
      body: refData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (data) {
          final styles = _faccao == null ? <CombatStyle>[] : data.stylesOfFaction(_faccao!);
          final style = _classe == null ? null : data.combatStyles.firstWhere((c) => c.name == _classe);
          final discs = _classe == null ? <Discipline>[] : data.disciplinesOfStyle(_classe!);
          final roleOptions = style?.allowedRoles ?? <String>[];
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              TextField(controller: _nome, decoration: const InputDecoration(labelText: 'Nome')),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _faccao,
                decoration: const InputDecoration(labelText: 'Facção'),
                items: data.factions.map((f) => DropdownMenuItem(value: f, child: Text(f))).toList(),
                onChanged: (v) => setState(() { _faccao = v; _classe = null; _disciplina = null; _role = null; }),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _classe,
                decoration: const InputDecoration(labelText: 'Combat Style'),
                items: styles.map((c) => DropdownMenuItem(value: c.name, child: Text(c.name))).toList(),
                onChanged: _faccao == null ? null : (v) => setState(() { _classe = v; _disciplina = null; _role = null; }),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _disciplina,
                decoration: const InputDecoration(labelText: 'Disciplina (opcional)'),
                items: [
                  const DropdownMenuItem(value: null, child: Text('— nenhuma —')),
                  ...discs.map((d) => DropdownMenuItem(value: d.name, child: Text('${d.name} (${d.role})'))),
                ],
                onChanged: _classe == null ? null : (v) => setState(() {
                  _disciplina = v;
                  if (v != null) _role = discs.firstWhere((d) => d.name == v).role; // role auto pela disciplina
                }),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _role,
                decoration: const InputDecoration(labelText: 'Role'),
                items: roleOptions.map((r) => DropdownMenuItem(value: r, child: Text(r))).toList(),
                onChanged: (_classe == null || _disciplina != null) ? null : (v) => setState(() => _role = v),
              ),
              const SizedBox(height: 12),
              TextField(controller: _itemLevel, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Item Level')),
              const SizedBox(height: 20),
              if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
              FilledButton(
                onPressed: (_saving || _nome.text.trim().isEmpty || _faccao == null || _classe == null || _role == null) ? null : _save,
                child: Text(_saving ? 'Salvando...' : 'Criar personagem'),
              ),
            ],
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: Verificar**

Run: `cd app && flutter analyze`
Expected: No issues found.

- [ ] **Step 3: Commit**

```bash
git add app/lib/features/characters/character_form_screen.dart
git commit -m "feat(app): formulário de personagem com dropdowns encadeados"
```

---

### Task 14: Tela de perfil (Tier + histórico)

**Files:**
- Create: `app/lib/features/characters/character_profile_screen.dart`

**Interfaces:**
- Consumes: `characterProvider(id)`, `charactersRepositoryProvider`.
- Produces: `CharacterProfileScreen` — cabeçalho (nome/classe/role/Tier), barra de progresso até o próximo Tier, histórico de bosses (via `history`).

- [ ] **Step 1: Implementar `app/lib/features/characters/character_profile_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'characters_providers.dart';

class CharacterProfileScreen extends ConsumerWidget {
  final int id;
  const CharacterProfileScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final char = ref.watch(characterProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: char.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (c) {
          final next = c.pointsToNextTier;
          final progress = next == null ? 1.0 : (c.totalPoints / (c.totalPoints + next)).clamp(0.0, 1.0);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: Column(children: [
                  CircleAvatar(radius: 36, child: Text(c.role[0], style: const TextStyle(fontSize: 24))),
                  const SizedBox(height: 8),
                  Text(c.nome, style: Theme.of(context).textTheme.headlineSmall),
                  Text('${c.faccao} · ${c.classe}${c.especializacao != null ? ' · ${c.especializacao}' : ''} · ${c.role}'),
                  const SizedBox(height: 8),
                  Chip(label: Text(c.tier == 0 ? 'Sem Tier' : 'Tier ${c.tier}')),
                ]),
              ),
              const SizedBox(height: 16),
              Text('${c.totalPoints} pontos' + (next != null ? ' · faltam $next para o próximo Tier' : ' · máximo!')),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: progress),
              const SizedBox(height: 24),
              Text('Histórico', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              FutureBuilder<List<Map<String, dynamic>>>(
                future: ref.read(charactersRepositoryProvider).history(id),
                builder: (context, snap) {
                  if (!snap.hasData) return const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator());
                  final rows = snap.data!;
                  if (rows.isEmpty) return const Text('Nenhum boss concluído ainda.');
                  return Column(
                    children: rows.map((r) => ListTile(
                      dense: true,
                      title: Text('${r['operation']} · ${r['boss']}'),
                      subtitle: Text('${r['difficulty'] ?? r['type']} · ${r['points']} pt'),
                    )).toList(),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: Verificar**

Run: `cd app && flutter analyze`
Expected: No issues found.

- [ ] **Step 3: Commit**

```bash
git add app/lib/features/characters/character_profile_screen.dart
git commit -m "feat(app): tela de perfil com Tier, progresso e histórico"
```

---

### Task 15: Rotas do app + navegação

**Files:**
- Modify: `app/lib/core/router/app_router.dart`
- Modify: `app/lib/features/home/home_screen.dart`

**Interfaces:**
- Consumes: as três telas (Tasks 12-14).
- Produces: rotas `/characters`, `/characters/new`, `/characters/:id`; um botão na Home para "Meus Personagens".

- [ ] **Step 1: Adicionar imports e rotas em `app/lib/core/router/app_router.dart`**

Imports:

```dart
import '../../features/characters/characters_list_screen.dart';
import '../../features/characters/character_form_screen.dart';
import '../../features/characters/character_profile_screen.dart';
```

Dentro de `routes: [ ... ]` (após a rota `/home`):

```dart
      GoRoute(path: '/characters', builder: (_, _) => const CharactersListScreen()),
      GoRoute(path: '/characters/new', builder: (_, _) => const CharacterFormScreen()),
      GoRoute(
        path: '/characters/:id',
        builder: (_, state) => CharacterProfileScreen(id: int.parse(state.pathParameters['id']!)),
      ),
```

> **Nota:** a guarda de `redirect` já existente só protege `/login`↔`/home`; como as rotas novas exigem estar logado, adicione `/characters` ao check: no `redirect`, troque a condição `!signedIn && !onLogin` para redirecionar qualquer rota que não seja `/login` quando não logado (já é o comportamento atual, pois só `/login` é exceção). Nenhuma mudança extra necessária.

- [ ] **Step 2: Adicionar botão na Home** — em `app/lib/features/home/home_screen.dart`, dentro do `Column` do `body`, após o `Text('Papel: ...')`:

```dart
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => context.push('/characters'),
                  icon: const Icon(Icons.people),
                  label: const Text('Meus Personagens'),
                ),
```

E garantir o import do go_router no topo do arquivo:

```dart
import 'package:go_router/go_router.dart';
```

- [ ] **Step 3: Verificar**

Run: `cd app && flutter analyze && flutter test`
Expected: No issues found; testes passam.

- [ ] **Step 4: Build web (prova de compilação fim-a-fim)**

Run: `cd app && flutter build web --dart-define=API_BASE_URL=http://localhost:3010`
Expected: `√ Built build/web`.

- [ ] **Step 5: Commit**

```bash
git add app/lib/core/router/app_router.dart app/lib/features/home/home_screen.dart
git commit -m "feat(app): navegação de personagens a partir da Home"
```

---

## Verificação final (Definition of Done)

- [ ] `cd backend && npm test` — toda a suíte verde (inclui reference, tier, validation, progression, characters.routes + os do #1).
- [ ] `cd backend && npm run build && npm run typecheck` — exit 0.
- [ ] `npm run migrate` cria `002_personagens` e semeia 105 bosses.
- [ ] `cd app && flutter analyze && flutter test` — limpos.
- [ ] `flutter build web` compila.
- [ ] Invariante `SUM(points) === 105` coberto por teste.

---

## Self-review (cobertura do spec)

- Modelo de dados (personagens/bosses/character_bosses): Task 4. ✓
- Constantes de referência (16 styles, 48 disc): Task 1; seed 105: Task 2. ✓
- Validação cross-field: Task 6; revalidação no update: Task 7. ✓
- Tier derivado (regra fixa) + pointsToNextTier: Task 3; usado no service: Task 7. ✓
- Progressão idempotente + revoke + history: Task 8. ✓
- API (reference/characters/admin): Task 9; posse (403) e admin (403) testados. ✓
- Bootstrap real: Task 10. ✓
- Flutter (modelos/providers/lista/form/perfil/rotas): Tasks 11-15. ✓
- Invariante SUM===105: Task 2. ✓
