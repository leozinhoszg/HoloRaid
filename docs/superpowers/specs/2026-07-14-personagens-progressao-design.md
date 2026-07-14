# RaidSync — Personagens & Progressão PvE (Design)

- **Data:** 2026-07-14
- **Subsistema:** #2 de 10 — Personagens & Progressão PvE / Tier
- **Depende de:** #1 Fundação & Segurança (auth, RBAC, Kysely, migrations, app factory)
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

Sobre a fundação do #1, este subsistema adiciona o gerenciamento de **personagens**
dos usuários e o **sistema de progressão PvE** que alimenta o **Tier** (calculado
automaticamente, nunca editável). É a base que os subsistemas de Raids (#3) e Perfil
(#7) vão consumir.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alcance | Backend (TypeScript) **+ telas Flutter** (lista, criar/editar, perfil). |
| Modelo de pontos | **1 ponto por objetivo concluído**; SM = 0. Três tipos: boss por dificuldade (Veteran/Master contam separado), timer (por operation), lair boss. **Total possível = 105 = Tier 6**. |
| Ops não pontuadas | Eternity Vault, Karagga's Palace, Random, Poll. |
| Classe/Spec | `classe` = **Combat Style** (16). `especializacao` = **Disciplina** (48, opcional; define a role). `origin_story` opcional (p/ futuro). `role` = Tank/Healer/DPS. |
| Arquitetura | **Abordagem A**: classes/disciplinas/roles como **constantes TS** (via `GET /reference`); **bosses seedados no DB** (FK de `character_bosses`); `total_points` armazenado; **Tier derivado** na leitura. |

## Objetivos e critérios de sucesso

- Usuário cria/edita/exclui seus personagens, com combinações Facção→Combat Style→
  Disciplina→Role sempre válidas (validadas no cliente e no servidor).
- `ProgressionService.awardBossCompletions` registra conclusões de forma **idempotente**,
  recalcula `total_points` e o Tier acompanha automaticamente.
- Um teste garante o invariante **`SUM(points)` de todos os bosses = 105**.
- Telas Flutter: lista de personagens, formulário com dropdowns encadeados, e perfil
  com pontos/Tier/barra de progresso/histórico.
- Nenhuma rota permite editar `total_points`/Tier diretamente.

## Fora de escopo

Gatilho automático de award ao finalizar raid (é do #3 — que chamará este
`ProgressionService`), Discord, Socket.IO, dashboard, e a tela admin de award
player-facing (opcional/adiável).

---

## Seção 1 — Modelo de dados

Migration nova (segue o padrão Kysely do #1: `002_personagens.ts`).

```sql
personagens
  id            BIGINT PK AUTO
  usuario_id    BIGINT FK → usuarios(id) ON DELETE CASCADE
  nome          VARCHAR(64) NOT NULL
  faccao        ENUM('Republic','Empire') NOT NULL
  classe        VARCHAR(32) NOT NULL          -- Combat Style (Guardian…)
  especializacao VARCHAR(48) NULL             -- Disciplina opcional (Defense…)
  role          ENUM('Tank','Healer','DPS') NOT NULL
  origin_story  VARCHAR(32) NULL              -- opcional (Jedi Knight…)
  item_level    INT NOT NULL
  total_points  INT NOT NULL DEFAULT 0        -- soma dos bosses concluídos (denormalizado)
  created_at    DATETIME NOT NULL
  updated_at    DATETIME NOT NULL
  INDEX (usuario_id)

bosses                                         -- referência seedada (105 objetivos)
  id            BIGINT PK AUTO
  operation     VARCHAR(64) NOT NULL
  boss          VARCHAR(64) NOT NULL
  difficulty    ENUM('Veteran','Master') NULL  -- null p/ type='timer'
  type          ENUM('boss','timer','lair') NOT NULL
  points        INT NOT NULL DEFAULT 1
  UNIQUE (operation, boss, difficulty, type)

character_bosses
  id            BIGINT PK AUTO
  personagem_id BIGINT FK → personagens(id) ON DELETE CASCADE
  boss_id       BIGINT FK → bosses(id)
  completed_at  DATETIME NOT NULL
  UNIQUE (personagem_id, boss_id)              -- idempotente
  INDEX (personagem_id)
```

**Referência como constantes TS** (`src/reference/swtor.ts`), fonte única servida via
API (ver Apêndices A–C para os dados completos):
- `FACTIONS = ['Republic','Empire']`, `ROLES = ['Tank','Healer','DPS']`
- `COMBAT_STYLES` (16): `{ name, faccao, originStory, allowedRoles }`
- `DISCIPLINES` (48): `{ name, combatStyle, role, mirror }`
- `BOSSES_SEED` (105): usado pela migration de seed e por um teste de invariante.

**Tier nunca é coluna** — derivado de `total_points` na leitura.

## Seção 2 — Regras de domínio

**Validação de personagem** (Zod com `.superRefine` cross-field):
- `faccao` ∈ FACTIONS.
- `classe` ∈ combat styles cuja `faccao` == a do personagem.
- `especializacao` (se informada) ∈ disciplinas cujo `combatStyle` == `classe`, e
  `discipline.role` == `role`.
- `role` ∈ `allowedRoles` da `classe`.
- `origin_story` (se informada) == `originStory` da `classe`.
- `item_level` inteiro 0–10000; `nome` 1–64 chars (trim).

**ProgressionService** (unidade reusada pelo #3):
- `awardBossCompletions(personagemId, bossIds[]): Promise<{ awarded: number; total_points: number }>`
  — insere apenas bosses ainda não concluídos (idempotente), recalcula
  `total_points = SUM(points)` dos concluídos, em **transação**.
- `revokeBossCompletion(personagemId, bossId): Promise<void>` — correção de admin;
  remove e recalcula.
- `getHistory(personagemId): Promise<HistoryEntry[]>` — bosses concluídos com
  operation/boss/difficulty/points/completed_at.

**Tier** (regra fixa do context, função pura `calcularTier(points): 0..6`):
```
points >= 105 → 6
points >= 100 → 5
points >=  90 → 4
points >=  76 → 3
points >=  51 → 2
points >=  26 → 1
senão         → 0
```
A leitura de personagem devolve `tier` e `pointsToNextTier`.

## Seção 3 — API

Todas exigem auth (guards do #1). Escrita **owner-only**; leitura de um personagem por
id liberada a qualquer autenticado (rosters do #3/#7).

```
GET    /reference/classes        → { factions, roles, originStories, combatStyles, disciplines }
GET    /reference/bosses         → objetivos pontuáveis (tabela bosses), agrupados por operation

GET    /characters               → meus personagens (com tier)
POST   /characters               → criar (meu)
GET    /characters/:id           → qualquer autenticado; inclui tier + pointsToNextTier
PATCH  /characters/:id           → editar (dono; total_points/tier não editáveis)
DELETE /characters/:id           → excluir (dono)
GET    /characters/:id/history   → bosses concluídos

POST   /admin/characters/:id/bosses          → award (admin) { bossIds:number[] }
DELETE /admin/characters/:id/bosses/:bossId  → revogar (admin)
```

O `POST /admin/.../bosses` testa/corrige progressão já no #2; o #3 reusa o
`ProgressionService`, não a rota.

## Seção 4 — Camada Flutter

Providers Riverpod novos: `referenceProvider` (cacheia `GET /reference/classes`),
`charactersProvider` (lista do usuário), `characterProvider(id)`.

- **CharactersListScreen** — cards (nome, Combat Style, badge de role, chip de Tier,
  pontos, item level), skeleton loading, FAB para criar.
- **CharacterFormScreen** (criar/editar) — dropdowns encadeados Facção → Combat Style →
  (Disciplina opcional) → Role (auto pela disciplina, ou escolhida entre as permitidas)
  → item level + nome. Valida no cliente e trata 422 do servidor.
- **CharacterProfileScreen** — cabeçalho (nome/classe/role/Tier), barra de progresso até
  o próximo Tier (`pointsToNextTier`), histórico agrupado por operation.

Microinterações e skeletons conforme `design_system.md` (sem shaders/WebGL — isso é o
subsistema visual). Tela admin de award: opcional/adiável.

## Seção 5 — Segurança & testes

**Autorização:** `requireAuth` em tudo; posse (`personagem.usuario_id === req.user.sub`)
na escrita, senão 403; `requireAdmin` no award/revoke.

**Testes** (integração via supertest com repos falsos, sem MySQL — padrão do #1):
- `calcularTier` nas fronteiras: 0, 25, 26, 50, 51, 75, 76, 89, 90, 99, 100, 104, 105.
- Validação de criação: combat style inválido p/ facção (422); disciplina fora da classe
  (422); role não permitida (422); `discipline.role ≠ role` (422); caminho feliz com e
  sem disciplina (201).
- Posse: usuário A não edita/exclui personagem de B (403).
- Progressão: award **idempotente** (mesmo boss 2× não duplica); `total_points` e Tier
  corretos após award; revoke recalcula.
- Referência: 16 combat styles, 48 disciplinas; **invariante `SUM(points) === 105`**.

## Dependências (nada novo além do #1)

Reusa Express/Kysely/Zod/vitest/supertest do backend e Riverpod/GoRouter/Dio do Flutter.

## Riscos e questões em aberto

- **Nomes de operation/boss** no seed devem ser consistentes com o que o #3 usará ao
  criar raids (a lista fixa de Operations do context). O seed usa os nomes do Apêndice C.
- **Item level** sem teto rígido do jogo — usamos 0–10000 como sanidade.
- **Dual combat style** (assinante com 2 estilos) não é modelado — cada personagem tem 1
  Combat Style; o usuário cria múltiplos personagens (YAGNI).

## Próximo passo

Transicionar para `writing-plans` e gerar o plano faseado (migration+seed → reference →
personagens CRUD → progressão/Tier → Flutter).

---

## Apêndice A — Combat Styles (16)

`{ name, faccao, originStory, allowedRoles }`

**Republic:**
- Guardian — Jedi Knight — [Tank, DPS]
- Sentinel — Jedi Knight — [DPS]
- Sage — Jedi Consular — [Healer, DPS]
- Shadow — Jedi Consular — [Tank, DPS]
- Commando — Trooper — [Healer, DPS]
- Vanguard — Trooper — [Tank, DPS]
- Gunslinger — Smuggler — [DPS]
- Scoundrel — Smuggler — [Healer, DPS]

**Empire:**
- Juggernaut — Sith Warrior — [Tank, DPS]
- Marauder — Sith Warrior — [DPS]
- Sorcerer — Sith Inquisitor — [Healer, DPS]
- Assassin — Sith Inquisitor — [Tank, DPS]
- Mercenary — Bounty Hunter — [Healer, DPS]
- Powertech — Bounty Hunter — [Tank, DPS]
- Sniper — Imperial Agent — [DPS]
- Operative — Imperial Agent — [Healer, DPS]

## Apêndice B — Disciplinas (48)

`{ name, combatStyle, role, mirror }` — mirror = disciplina espelhada na outra facção.

**Republic:**
| Combat Style | Disciplina | Role | Mirror (Empire) |
|---|---|---|---|
| Guardian | Defense | Tank | Immortal |
| Guardian | Vigilance | DPS | Vengeance |
| Guardian | Focus | DPS | Rage |
| Sentinel | Watchman | DPS | Annihilation |
| Sentinel | Combat | DPS | Carnage |
| Sentinel | Concentration | DPS | Fury |
| Sage | Seer | Healer | Corruption |
| Sage | Telekinetics | DPS | Lightning |
| Sage | Balance | DPS | Madness |
| Shadow | Kinetic Combat | Tank | Darkness |
| Shadow | Infiltration | DPS | Deception |
| Shadow | Serenity | DPS | Hatred |
| Commando | Combat Medic | Healer | Bodyguard |
| Commando | Gunnery | DPS | Arsenal |
| Commando | Assault Specialist | DPS | Innovative Ordnance |
| Vanguard | Shield Specialist | Tank | Shield Tech |
| Vanguard | Tactics | DPS | Advanced Prototype |
| Vanguard | Plasmatech | DPS | Pyrotech |
| Gunslinger | Sharpshooter | DPS | Marksmanship |
| Gunslinger | Saboteur | DPS | Engineering |
| Gunslinger | Dirty Fighting | DPS | Virulence |
| Scoundrel | Sawbones | Healer | Medicine |
| Scoundrel | Scrapper | DPS | Concealment |
| Scoundrel | Ruffian | DPS | Lethality |

**Empire:** (espelho — mesmos role, mirror invertido)
| Combat Style | Disciplina | Role | Mirror (Republic) |
|---|---|---|---|
| Juggernaut | Immortal | Tank | Defense |
| Juggernaut | Vengeance | DPS | Vigilance |
| Juggernaut | Rage | DPS | Focus |
| Marauder | Annihilation | DPS | Watchman |
| Marauder | Carnage | DPS | Combat |
| Marauder | Fury | DPS | Concentration |
| Sorcerer | Corruption | Healer | Seer |
| Sorcerer | Lightning | DPS | Telekinetics |
| Sorcerer | Madness | DPS | Balance |
| Assassin | Darkness | Tank | Kinetic Combat |
| Assassin | Deception | DPS | Infiltration |
| Assassin | Hatred | DPS | Serenity |
| Mercenary | Bodyguard | Healer | Combat Medic |
| Mercenary | Arsenal | DPS | Gunnery |
| Mercenary | Innovative Ordnance | DPS | Assault Specialist |
| Powertech | Shield Tech | Tank | Shield Specialist |
| Powertech | Advanced Prototype | DPS | Tactics |
| Powertech | Pyrotech | DPS | Plasmatech |
| Sniper | Marksmanship | DPS | Sharpshooter |
| Sniper | Engineering | DPS | Saboteur |
| Sniper | Virulence | DPS | Dirty Fighting |
| Operative | Medicine | Healer | Sawbones |
| Operative | Concealment | DPS | Scrapper |
| Operative | Lethality | DPS | Ruffian |

Resumo: 6 disciplinas Tank, 6 Healer, 36 DPS.

## Apêndice C — Seed de bosses (105 pontos)

**Tipo `boss`** — 1 ponto por dificuldade. Operations com Veteran **e** Master geram 2
linhas por boss; operations com Master N/A geram só a linha Veteran.

Veteran + Master (2 pts/boss):
- **Explosive Conflict**: Zorn & Toth, Tanks, Minefield, Kephess → 8
- **Terror From Beyond**: Writhing Horror, Dread Guards, Operator IX, Kephess, Terror From Beyond → 10
- **Scum and Villainy**: Dash, Titan 6, Thrasher, Operations Chief, Olok, Warlords, Styrak → 14
- **Dread Fortress**: Nefra, Draxus, Grob'Thok, Corrupter Zero, Brontes → 10
- **Dread Palace**: Bestia, Tyrans, Calphayus, Raptus, Council → 10
- **Dxun**: Red, Lights Out, According to Plan, Trandoshans, Huntmaster, Apex → 12
- **Gods from the Machine**: Tyth, Aivela & Esne, Nahut, Scyva, Izax → 10

Só Veteran (Master N/A, 1 pt/boss):
- **R-4 Anomaly**: IP-CPT, Watchdog, Kanoth, Lady Dominique → 4
- **Ravagers**: Sparky, Quartermaster, Torque, Master & Blaster, Coratanni → 5
- **Temple of Sacrifice**: Malaphar, Sword Squadrons, Underlurker, Revanite Commander, Revan → 5

Subtotal `boss` = **88**.

**Tipo `timer`** — 1 ponto por operation completada no tempo (`difficulty` null):
Explosive Conflict, Terror From Beyond, Scum and Villainy, Dread Palace, Dread Fortress,
Dxun, Gods from the Machine, R-4 Anomaly → **8**.

**Tipo `lair`** — operations de 1 boss só, 1 ponto por clear:
- Monolith — Veteran
- Hive Queen — Veteran
- XR-53 — Veteran
- XR-53 — Master
- Golden Fury — Veteran
- Eyeless — Veteran
- Xeno — Veteran
- Hateful Entity — Master
- Dreadful Entity — Veteran

Subtotal `lair` = **9**.

**TOTAL = 88 + 8 + 9 = 105** (= Tier 6). Um teste de invariante valida essa soma.
