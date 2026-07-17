# HoloRaid — Dashboard global (#7) — Design

- **Data:** 2026-07-17
- **Subsistema:** #7 (Dashboard) de ~10
- **Depende de:** #1 (auth/JWT), #2 (personagens), #3 (raids, raid_players). Independe de #4–#6b.
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O dump do produto lista um "Dashboard" com: *raids hoje, raids da semana, raids do mês,
participantes, operations mais jogadas, jogadores mais ativos*. No brainstorming ficou
definido que o #7 é o **pulso da comunidade** (números globais, não pessoais), visível a
**qualquer usuário logado**. É read-only e aditivo — nenhuma tabela nova, nenhuma escrita.

**Fuso horário (decisão de design central).** Como o Discord, os horários são guardados em
UTC e renderizados no fuso de quem olha — o app já faz isso para horários individuais
(`start_at` gravado em UTC, Flutter mostra com `.toLocal()`). Mas "raids **hoje**/semana/mês"
é uma **contagem por faixa de dia**, e faixa de dia depende do fuso: "hoje" em São Paulo
termina 3h depois de "hoje" em Londres. A solução no espírito do Discord: **quem sabe o fuso é
o cliente**, então é o cliente que calcula as fronteiras (início de hoje/semana/mês no fuso do
dispositivo), converte para instante UTC e as envia ao endpoint. O servidor só conta
`start_at >= fronteira` — zero lógica de fuso no backend, e o resultado fica correto para cada
leitor. A convenção de início de semana (domingo vs segunda) também fica no cliente.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Escopo | **Global/comunidade** — números agregados, iguais para todos. |
| Acesso | **Qualquer usuário logado** (`requireAuth`). Sem nada novo de auth. |
| Fuso | **Cliente envia as fronteiras** de hoje/semana/mês (ISO UTC, calculadas no fuso do device). Servidor não faz aritmética de fuso. Fallback UTC se ausentes. |
| Rankings | **All-time** (top operations, top players) — mais estáveis e sociais que recortes que zeram toda semana. |
| Participantes | **Distintos, do mês corrente** (número que conta história, não um total que só cresce). |
| Backend | **Um endpoint** `GET /dashboard`, um `DashboardService` com ~4 queries de agregação. Dep opcional no `createApp`. |
| Cache | Nenhum (YAGNI: queries baratas, tráfego mínimo). |
| Flutter | Uma `DashboardScreen` + botão na `home`. Reusa `apiClientProvider`. |

## Objetivos e critérios de sucesso

- Um usuário logado abre o Dashboard e vê: raids hoje/semana/mês, participantes do mês, top 5
  operations, top 5 jogadores mais ativos.
- As contagens de período respeitam o **fuso do usuário** (uma raid que, no fuso local, é de
  ontem **não** entra em "hoje").
- Raids **CANCELLED** não contam em nenhuma métrica de período.
- Rankings ordenam por contagem desc e cortam em 5.
- "Participantes" conta jogadores **distintos** (quem entrou em 3 raids conta 1).
- Sem JWT → 401.
- Os 202 testes de #1–007 seguem verdes.

## Fora de escopo

- Métricas pessoais / "minhas stats" (é o Perfil — outra fatia).
- Gráficos/tendências ao longo do tempo (só números e listas nesta fatia).
- Filtros (por facção, por operation, por intervalo custom).
- Cache, materialização, paginação dos rankings.
- Localizar as faixas por fuso **no servidor** (é o cliente que manda as fronteiras).
- Ações de admin (o Painel Administrativo é outra coisa).

---

## Seção 1 — Métricas (definições concretas)

| Métrica | Definição exata | Base |
|---------|-----------------|------|
| `raids.today` | nº de raids com `start_at >= todayStart`, `status != 'CANCELLED'` | fronteira do cliente |
| `raids.week` | nº de raids com `start_at >= weekStart`, `status != 'CANCELLED'` | fronteira do cliente |
| `raids.month` | nº de raids com `start_at >= monthStart`, `status != 'CANCELLED'` | fronteira do cliente |
| `participantsThisMonth` | `usuario_id` **distintos** em `raid_players`, cujas raids têm `start_at >= monthStart` e `status != 'CANCELLED'` | fronteira do cliente |
| `topOperations` | top 5 `operation` por nº de raids (`status != 'CANCELLED'`), desc | all-time |
| `topPlayers` | top 5 `usuario_id` por nº de linhas em `raid_players`, com `username`+`avatar`, desc | all-time |

> As três fronteiras são **instantes UTC** (o `>=` compara com `start_at`, que já é UTC). Como
> são só limites inferiores, "esta semana" e "este mês" incluem o futuro agendado — coerente
> com "quantas raids há nesta semana/mês", não "quantas já aconteceram".

## Seção 2 — Backend

**Endpoint:** `GET /dashboard` (atrás de `requireAuth`), query params **opcionais**:
`today`, `week`, `month` — cada um um datetime ISO. Validados por Zod (`z.coerce.date()`);
ausentes → o service usa fronteiras UTC (início do dia/semana/mês UTC) como fallback.

**Resposta:**
```jsonc
{
  "raids": { "today": 2, "week": 7, "month": 19 },
  "participantsThisMonth": 23,
  "topOperations": [{ "operation": "Dread Palace", "count": 12 }],
  "topPlayers": [{ "usuario_id": 4, "username": "kira", "avatar": null, "raids": 9 }]
}
```

**`DashboardService`** (`modules/dashboard/dashboard.service.ts`):
```ts
type Boundaries = { today: Date; week: Date; month: Date };
createDashboardService(deps: { db: Kysely<DB> }): {
  getStats(b: Boundaries): Promise<DashboardStats>;
}
```
Faz as queries de agregação direto no Kysely (`count`, `countDistinct`, `groupBy`, `orderBy`,
`limit`) — este é um caso de leitura analítica, então usar o `db` diretamente é mais claro que
inflar os repos de escrita com métodos de relatório. `topPlayers` faz `innerJoin` em
`usuarios` para `username`/`avatar`.

**Router/controller** (`dashboard.router.ts`, `dashboard.controller.ts`): o controller lê os 3
params, monta `Boundaries` (com fallback UTC via helpers `startOfUtcDay/Week/Month`) e chama
`getStats`. Montado no `createApp` só quando `db` (ou o service) é passado — padrão opcional de
sempre; **#1–007 intactos**.

## Seção 3 — Flutter

`DashboardScreen` (`features/dashboard/`):
- No boot, calcula as 3 fronteiras **em local** e converte para UTC:
  `DateTime(now.year, now.month, now.day)` → `.toUtc().toIso8601String()` (hoje);
  início da semana (segundo o locale) e `DateTime(now.year, now.month, 1)` idem.
- `GET /dashboard?today=…&week=…&month=…` via `apiClientProvider`.
- UI: uma linha de *stat cards* (Hoje / Semana / Mês / Participantes) + duas listas
  (Top Operations com contagem; Top Players com avatar, nome e nº de raids).
- Botão "Dashboard" na `home_screen`.

Sem widget test (o projeto não testa telas); verificação por `flutter analyze` + smoke manual.

## Seção 4 — Segurança & testes

**Segurança:** só agregados (contagens, nomes, avatares que já são públicos no roster). Nenhum
dado sensível. `requireAuth` evita exposição anônima. As fronteiras vêm do cliente mas são só
**limites de tempo** — não dá para vazar nada além de contagens; datas absurdas só produzem
números vazios.

**Testes** (`dashboard.service.test.ts` com fakes/seed em memória, e `dashboard.routes.test.ts`):
- **Períodos:** raid com `start_at` antes de `todayStart` **não** entra em `today`; entra em
  `week`/`month` se dentro. Raid **CANCELLED** não conta em período nenhum.
- **Fronteiras do cliente:** passar `todayStart` diferente muda a contagem (prova que a faixa
  vem do param, não de UTC fixo).
- **participantsThisMonth:** jogador em 3 raids do mês conta **1**; raid de mês passado não
  conta.
- **topOperations:** ordena desc, corta em 5, ignora CANCELLED.
- **topPlayers:** ordena por nº de inscrições desc, corta em 5, traz `username`/`avatar`.
- **Rota:** `GET /dashboard` sem JWT → 401; com JWT → 200 e shape completo; sem params → usa
  fallback UTC sem erro.
- **Regressão:** 202 testes de #1–007 verdes.
- **Smoke manual:** criar algumas raids (uma hoje, uma semana passada, uma CANCELLED) + joins,
  abrir a tela e conferir os números no fuso local.

## Riscos e questões em aberto

- **Cliente mente na fronteira.** Um cliente pode enviar `today` arbitrário e ver contagens de
  outra faixa. Inofensivo: são dados agregados públicos, e "hoje" é do próprio usuário mesmo —
  não há nada a proteger. É por isso que a fronteira poder vir do cliente é aceitável.
- **DST na virada do mês:** o offset local pode mudar no meio do mês. Como o **cliente** calcula
  `monthStart` no seu próprio relógio local, ele acerta o instante — o servidor só recebe o
  UTC pronto. Sem problema.
- **Sem cache:** se um dia o volume crescer, os `GROUP BY` all-time podem pesar; hoje são
  triviais. Índices de `raids(status, start_at)` e `raid_players(usuario_id)` já ajudam
  (parcialmente existentes). Anotado, não otimizado.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (service + queries → controller/router com
fallback UTC → wiring no app/server → tela Flutter).

---

## Apêndice — Contratos (referência)

```ts
// Novo (modules/dashboard/dashboard.service.ts):
export type DashboardStats = {
  raids: { today: number; week: number; month: number };
  participantsThisMonth: number;
  topOperations: { operation: string; count: number }[];
  topPlayers: { usuario_id: number; username: string; avatar: string | null; raids: number }[];
};
export type Boundaries = { today: Date; week: Date; month: Date };
createDashboardService(deps: { db: Kysely<DB> }): { getStats(b: Boundaries): Promise<DashboardStats> };

// Novo (modules/dashboard/dashboard.router.ts):
createDashboardRouter(service: DashboardService): Router; // GET /dashboard, requireAuth

// Helpers de fallback (dashboard.controller.ts ou util):
startOfUtcDay(now: Date): Date; startOfUtcWeek(now: Date): Date; startOfUtcMonth(now: Date): Date;

// Alterado (app.ts): deps ganha
dashboardService?: DashboardService
```
