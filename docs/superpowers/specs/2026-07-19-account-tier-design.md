# Tier por conta — design

**Data:** 2026-07-19
**Status:** aprovado, aguardando plano de implementação

## Problema

Hoje a progressão PvE (bosses marcados → pontos → Tier) pertence ao **personagem**:

- `character_bosses` é chaveado por `personagem_id`.
- `personagens.total_points` guarda os pontos por personagem.
- O Tier **não é armazenado** — é derivado em tempo de leitura por `calcularTier(total_points)` (`backend/src/common/progression/tier.ts`).

Consequência: um jogador com dois personagens (ex.: "Tenebalde" Vanguard e "Mr'Fire" Powertech) precisa marcar bosses e subir Tier **em cada personagem separadamente**, e no roster/sign cada char mostra seu próprio Tier. Isso não reflete a realidade: quem matou um boss, matou na conta.

## Objetivo

Amarrar a progressão (bosses marcados, pontos, Tier) à **conta/usuário**. O jogador marca uma vez os bosses que já fez, e o Tier resultante vale para **todos os seus personagens**, aparecendo:

- no **menu lateral** (item dedicado "Minha progressão PvE"),
- no **Perfil** da conta,
- no **roster / "sign"** quando entra numa raid,

tudo com **badge e cores** (paleta fria→quente).

Os thresholds de Tier (`[26, 51, 76, 90, 100, 105]`) e o catálogo de 105 bosses **não mudam** — só muda o *dono* dos pontos.

## Escopo

### 1. Modelo de dados (backend)

- **`usuarios`** ganha `total_points INT NOT NULL DEFAULT 0`.
- **Nova tabela `usuario_bosses`**: `(id, usuario_id, boss_id, completed_at)`, com:
  - índice único `(usuario_id, boss_id)` (um boss conta uma vez por conta),
  - FK `usuario_id → usuarios.id` ON DELETE **cascade**,
  - FK `boss_id → bosses.id` ON DELETE **restrict** (espelha o comportamento do catálogo).
  - FKs criadas com `addForeignKeyConstraint` (nunca `.references()` inline — lição da `007`).
- **Migração de dados** (nova migration, após criar a tabela e a coluna):
  1. Para cada usuário, insere em `usuario_bosses` a **união distinta** dos `boss_id` presentes em `character_bosses` de todos os seus personagens (`SELECT DISTINCT p.usuario_id, cb.boss_id ... JOIN`).
  2. Recalcula `usuarios.total_points` somando `bosses.points` sobre `usuario_bosses`.
  3. **Remove** `personagens.total_points` e a tabela `character_bosses` (com sua FK/índice).
  - A migration falha alto se houver órfão; **não** limpa dados por conta própria.
- `bosses` (catálogo) e `tier.ts` ficam intactos.

### 2. Backend — serviços e endpoints

- **`ProgressionService`** (`recomputeTotal`, `award`, `revoke`, `setCompletions`) passa a operar por **`usuarioId`**, lendo/escrevendo `usuario_bosses` e `usuarios.total_points`.
- **Endpoints re-escopados para a conta** (sempre `req.user.sub`, nunca id do cliente):
  - `PUT /me/bosses` (substitui `PUT /characters/:id/bosses`) — set em lote (diff add/remove + recompute).
  - `GET /me/bosses` (substitui `GET /characters/:id/history`) — bosses marcados da conta.
  - Admin: `POST /admin/users/:id/bosses` e `DELETE /admin/users/:id/bosses/:bossId` (substituem os `/admin/characters/:id/...`), `requireAdmin`.
  - `GET /reference/bosses` (catálogo) permanece.
- **Tier derivado passa a ler os pontos da conta:**
  - `characters.service.view()` anexa `tier` + `pointsToNextTier` **da conta** a cada personagem (todos os chars da conta mostram o mesmo Tier).
  - `raidJoin.service` gate: `calcularTier(pontos_da_conta) >= minimum_tier` **E** `personagem.faccao == raid.faction` (facção continua por personagem).
  - `raidPlayerRepo.listRoster` seleciona `usuarios.total_points` (via join) em vez de `personagens.total_points`.
  - `raids.service` enriquecimento do roster segue a mesma fonte.
  - Discord `components.ts` / `embed.ts`: elegibilidade e labels de Tier pela conta.
- `GET /me` passa a expor `total_points` (e opcionalmente `tier`/`pointsToNextTier` derivados) para o app.

### 3. App Flutter — telas e badge

- **Novo item no menu lateral** "Minha progressão PvE" → tela de marcação de bosses da conta (reaproveita a atual `character_progression_screen`, re-endereçada para `/me/bosses`, agrupando por operation). O botão "Marcar bosses" **por personagem é removido**.
- **Perfil (conta)**: mostra o **Tier da conta direto** (`total_points`/`tier` de `/me`) com a barra "faltam N para o próximo Tier", em vez de agregar `sum(total_points)` / `max(tier)` dos personagens como hoje (`profile_screen.dart`).
- **Lista de personagens / roster / "sign" da raid**: o badge de Tier deixa de ser por personagem e passa a ser o **Tier da conta** — consistente em todos os chars e no roster quando entra numa raid. O filtro de elegibilidade de join (`raid_detail_screen._join`) usa Tier da conta + facção do personagem.
- **Novo widget `TierBadge`** reutilizável (perfil, menu, roster, sign), centralizando a paleta **fria→quente**:

  | Tier | Cor | Ideia |
  |---|---|---|
  | Sem Tier (0) | cinza neutro | apagado |
  | 1–2 | azul | ciano/azul frio |
  | 3–4 | violeta HoloRaid | cor da marca |
  | 5 | dourado | quente |
  | 6 | glow ciano/magenta | o mais intenso, com brilho |

  Os hex exatos são definidos na implementação, alinhados ao tema holográfico; o `TierBadge` é a única fonte da verdade das cores.
- **Models** `character_model.dart` (`tier`, `pointsToNextTier`) e `raid_model.dart` (`RosterEntry.tier`) continuam carregando `tier`, mas agora alimentados pela fonte de conta no backend — o app não recalcula.

## Fora de escopo

- i18n das novas strings (segue o ciclo próprio de i18n; strings novas nascem em PT cravado como o resto do app hoje).
- Qualquer mudança nos thresholds de Tier ou no catálogo de bosses.
- Histórico/timeline de quando cada boss foi marcado além do `completed_at`.

## Riscos / notas

- **Migration destrutiva** (`DROP` de `character_bosses` e da coluna `total_points`): a união precisa rodar **antes** do drop, na mesma migration, e o smoke real deve provar que os pontos da conta batem com a soma esperada.
- **DDL no MySQL não é transacional** — se a migration falhar no meio, pode deixar estado parcial (lição da `007`). Rodar contra um banco com órfãos já limpos.
- **Testes**: os testes de progressão/tier hoje são por personagem; passam a ser por conta. Os fakes (`fakeRepos.ts`) e o service test real (MySQL) precisam refletir a nova chave.
- **Roster/Discord**: um mesmo usuário com dois chars no roster mostraria o mesmo Tier nos dois — comportamento desejado.
