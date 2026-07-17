# HoloRaid — Raids (Design)

- **Data:** 2026-07-14
- **Subsistema:** #3 de 10 — Raids
- **Depende de:** #1 Fundação & Segurança, #2 Personagens & Progressão
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

Sobre a fundação (#1) e os personagens/progressão (#2), este subsistema adiciona a
organização de **raids** (Operations): criar, listar, entrar/sair com validação de
facção/Tier/vagas, lista de espera, ciclo de status e compartilhamento. Inclui também
uma peça pequena que faltou no #2: o **auto-report de progressão** (o jogador marca os
bosses que matou no próprio personagem para estabelecer o Tier).

O tempo real (Socket.IO), a publicação no Discord e as notificações push ficam para os
subsistemas #4, #5 e #6 — o #3 funciona 100% via REST.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alcance | Backend (TypeScript) **+ telas Flutter**. |
| Autorização | Qualquer usuário cria uma raid e vira **líder** (`created_by`). Líder gerencia a própria; **admin** gerencia qualquer uma. Mesmo padrão posse+override do #2. |
| Campos de Discord | `Required Discord Roles` e `Disable Mentions` **adiados para o #5**. Só `discord_message_id` fica reservado (null). |
| Waitlist | **Auto-promoção FIFO** ao abrir vaga confirmada. |
| Vagas / Composition | Raid guarda `slots_tank/heal/dps` somando o `size` (default 8=2T/2H/4D, 16=2T/4H/10D, editável). `check_composition` ligado enforça por role; desligado vale só o total. |
| Fonte dos pontos | **Só auto-report do jogador.** Finalizar a raid **não** dá pontos — só muda o status. A raid usa o Tier apenas para gating + exibição. |
| Modelo de participantes | **Tabela única `raid_players`** com `status` (`confirmed`/`waitlist`), vagas calculadas contando confirmados. |

## Objetivos e critérios de sucesso

- Jogador auto-reporta bosses no próprio personagem (`PUT /characters/:id/bosses`),
  estabelecendo Tier antes de entrar em raids.
- Qualquer usuário cria raids; entra com um personagem válido (facção/Tier/vaga) ou vai
  para a waitlist; sair auto-promove o 1º da fila (FIFO).
- Ciclo de status guardado (OPEN→RUNNING→FINISHED/CANCELLED); ações restritas a
  líder/admin.
- Raid compartilhável por código + link + QR.
- Testes cobrem validações de join, lógica de vagas (headcount e por role), promoção da
  waitlist, transições de status e o auto-report.

## Fora de escopo

Socket.IO/tempo real (#4), publicação/edição no Discord (#5), push notifications (#6),
dashboard/estatísticas (#7), award automático de pontos ao finalizar (decisão: pontos só
por auto-report).

---

## Seção 1 — Peças & modelo de dados

O #3 tem duas peças: **(P0)** auto-report de progressão (completa o #2) e **(P1)** raids.

Migration nova `003_raids.ts`:

```sql
raids
  id            BIGINT PK AUTO
  codigo        VARCHAR(12) NOT NULL UNIQUE   -- código curto p/ compartilhar
  operation     VARCHAR(64) NOT NULL
  difficulty    ENUM('SM','HM','NiM') NOT NULL
  size          INT NOT NULL                  -- 8 ou 16
  faction       ENUM('Republic','Empire') NOT NULL
  minimum_tier  INT NOT NULL DEFAULT 0        -- 0..6
  check_composition BOOLEAN NOT NULL DEFAULT false
  slots_tank    INT NOT NULL                  -- somam o size
  slots_heal    INT NOT NULL
  slots_dps     INT NOT NULL
  notes         TEXT NULL
  start_at      DATETIME NOT NULL             -- data + hora
  status        ENUM('OPEN','RUNNING','FINISHED','CANCELLED') NOT NULL DEFAULT 'OPEN'
  discord_message_id VARCHAR(32) NULL          -- reservado p/ #5
  created_by    BIGINT FK → usuarios(id)       -- o líder
  created_at    DATETIME NOT NULL
  updated_at    DATETIME NOT NULL
  INDEX (status), INDEX (created_by), INDEX (codigo)

raid_players
  id            BIGINT PK AUTO
  raid_id       BIGINT FK → raids(id) ON DELETE CASCADE
  usuario_id    BIGINT FK → usuarios(id)
  personagem_id BIGINT FK → personagens(id)
  role          ENUM('Tank','Healer','DPS') NOT NULL   -- a role do personagem
  status        ENUM('confirmed','waitlist') NOT NULL
  joined_at     DATETIME NOT NULL
  UNIQUE (raid_id, usuario_id)                 -- 1 personagem por usuário por raid
  INDEX (raid_id, status)
```

**Constante nova** `OPERATIONS` (as 22 operations fixas do context, ver Apêndice A) em
`backend/src/reference/operations.ts`, exposta via `GET /reference/operations`. Os bosses
do auto-report vêm do `GET /reference/bosses` do #2.

## Seção 2 — Regras de domínio

**Ciclo de status** (transições guardadas, só líder/admin):
```
OPEN ──start──▶ RUNNING ──finish──▶ FINISHED (terminal)
  │                │
  └──────cancel────┴──────────────▶ CANCELLED (terminal)
```
FINISHED/CANCELLED são terminais. **Entrar/sair só quando OPEN.** Finalizar apenas seta o
status (sem pontos).

**Entrar** (`POST /raids/:id/join { personagem_id }`), validado em ordem:
1. Raid `OPEN` → senão `409`.
2. Personagem é do próprio usuário → senão `403`.
3. `personagem.faccao == raid.faction` → senão `422` com motivo.
4. `calcularTier(personagem.total_points) >= raid.minimum_tier` → senão `422`:
   *"Seu personagem possui Tier X. Esta raid exige Tier Y ou superior."*
5. Usuário ainda não está na raid (unique) → senão `409`.
6. Vaga:
   - `check_composition` **ligado**: conta confirmados da role do personagem; se
     `< slots_da_role` → `confirmed`, senão `waitlist`.
   - **desligado**: conta confirmados totais; se `< size` → `confirmed`, senão `waitlist`.

Retorna o participante + `status`.

**Sair** (`DELETE /raids/:id/leave`): remove o participante; se era `confirmed` e a raid
está `OPEN`, **auto-promove FIFO** o mais antigo da waitlist que caiba na vaga liberada
(mesma role se `check_composition`, senão o mais antigo geral).

**Auto-report (P0)** (`PUT /characters/:id/bosses { bossIds }`, owner-only):
**sincroniza** o conjunto — insere os que faltam, remove os desmarcados, recalcula
`total_points` e Tier. Idempotente. Admin mantém `award`/`revoke` do #2 para correções.

**Duplicar** (`POST /raids/:id/duplicate`): clona a config numa nova raid `OPEN` com novo
`codigo` e `created_by` = quem duplicou (sem copiar participantes).

**Validação de criação:** `slots_tank + slots_heal + slots_dps == size`; `size ∈ {8,16}`;
`operation ∈ OPERATIONS`; `minimum_tier ∈ 0..6`; `start_at` data válida.

## Seção 3 — API

Todas exigem auth (guards do #1). Escrita da raid = líder (`created_by == sub`) ou admin;
self-report = dono do personagem; join = só o próprio personagem.

```
# Progressão self-service (P0)
PUT    /characters/:id/bosses        → dono sincroniza { bossIds }

# Referência
GET    /reference/operations         → 22 operations fixas

# Raids
POST   /raids                        → criar (vira líder)
GET    /raids                        → listar (filtros: status, faction, operation)
GET    /raids/:id                    → detalhe + roster (participantes com Tier)
GET    /raids/code/:codigo           → resolver por código
PATCH  /raids/:id                    → editar (líder/admin, enquanto OPEN)
DELETE /raids/:id                    → excluir (líder/admin)
POST   /raids/:id/join               → entrar { personagem_id }
DELETE /raids/:id/leave              → sair (auto-promove waitlist)
POST   /raids/:id/start              → OPEN → RUNNING (líder/admin)
POST   /raids/:id/finish             → → FINISHED (líder/admin)
POST   /raids/:id/cancel             → → CANCELLED (líder/admin)
POST   /raids/:id/duplicate          → clonar em nova raid OPEN
```

O roster de `GET /raids/:id` inclui, por participante: nick/avatar do usuário, personagem
(nome/classe/especialização/role/item_level), `total_points`, `tier` e `status`.

## Seção 4 — Camada Flutter

Providers Riverpod novos: `operationsProvider` (cacheia `/reference/operations`),
`raidsProvider` (lista com filtros), `raidProvider(id)`.

- **RaidsListScreen** — cards (operation, difficulty, facção, data/hora, Tier mín.,
  `X/size` preenchido, chip de status). FAB criar. Skeleton loading.
- **RaidFormScreen** (criar/editar) — operation (dropdown), difficulty, size, facção,
  Tier mín., toggle Check Composition + editor de vagas (T/H/D somando o size, com default
  pela `size`), date picker, time picker, notas. Valida no cliente e trata 422.
- **RaidDetailScreen** — cabeçalho (operation/difficulty/facção/status/data/líder/Tier
  mín./notas); roster (confirmados agrupados por role + waitlist, cada um com
  personagem/role/**Tier**); botão Entrar (escolhe um personagem elegível) / Sair; ações do
  líder (start/finish/cancel/editar/duplicar/compartilhar). Compartilhar → link
  `https://raid.brazilforce.com/r/{codigo}` + **QR** (gerado no cliente com `qr_flutter`).
- **CharacterProgressionScreen** — checklist de bosses agrupado por operation (do
  `/reference/bosses`), marca/desmarca e salva via `PUT /characters/:id/bosses`. Acessível
  pelo perfil do personagem (#2).

Microinterações e skeletons do `design_system.md`; sem shaders/WebGL (subsistema visual).

## Seção 5 — Segurança & testes

**Autorização:** `requireAuth` em tudo; posse da raid (`created_by == sub`) ou `admin` nas
escritas/transições; posse do personagem no self-report e no join.

**Testes** (integração via supertest com repos falsos, sem MySQL — padrão #1/#2):
- Join: facção errada (422), Tier abaixo do mínimo (422), personagem de outro (403),
  duplicado (409), raid não-OPEN (409), caminho feliz (confirmed).
- Vagas: `check_composition` off enche até `size` → waitlist; on enche a quota da role →
  waitlist; roles diferentes não competem por vaga.
- Waitlist: auto-promoção FIFO ao sair (headcount e por role).
- Transições: start/finish/cancel guardados; não entra em raid não-OPEN; terminais
  bloqueiam re-transição.
- Criação: `slots` somam `size` (senão 422); `size` inválido (422).
- Self-report: sync altera `total_points`/Tier; owner-only (403 p/ outro); idempotente.
- Duplicar: nova raid OPEN, novo código, sem participantes. Código resolve via
  `/raids/code/:codigo`.

## Dependências

Backend: nada novo além do #1/#2 (Express/Kysely/Zod/vitest/supertest). Geração de código
curto com `node:crypto`. Flutter: adicionar `qr_flutter` para o QR; resto já instalado.

## Riscos e questões em aberto

- **Nomes de operation**: o dropdown usa `OPERATIONS` (22 fixas); o auto-report usa os
  nomes da tabela `bosses` (#2). Devem ser consistentes — o Apêndice A alinha os nomes.
- **Edição de vagas com participantes**: reduzir `slots` abaixo do nº de confirmados de uma
  role é bloqueado na edição (422) para não gerar estado inconsistente.
- **`start_at` no passado**: permitido (o líder pode registrar algo já agendado); sem trava
  rígida de data futura.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano faseado (P0 self-report → migration →
repos → RaidService/JoinService → rotas → Flutter).

---

## Apêndice A — OPERATIONS (lista fixa, 22)

Eternity Vault · Karagga's Palace · Explosive Conflict · Terror From Beyond ·
Scum and Villainy · Dread Fortress · Dread Palace · Ravagers · Temple of Sacrifice ·
Gods from the Machine · Nature of Progress (Dxun) · The R-4 Anomaly ·
Worldbreaker Monolith · Hive of the Mountain Queen · Golden Fury · Eyeless ·
Propagator Core XR-53 · Xenoanalyst II · Hateful Entity · Dreadful Entity · Random · Poll

> Observação: os nomes de scoring do #2 (Apêndice C daquela spec) usam formas curtas para
> alguns lair bosses (Monolith, Hive Queen, XR-53, Xeno). O dropdown de criação usa os nomes
> completos acima; a correspondência com os bosses pontuáveis é do #2 e não afeta o gating,
> que é por Tier (número), não por operation.
