# HoloRaid — Perfil pessoal (#8) — Design

- **Data:** 2026-07-17
- **Subsistema:** Perfil (do dump de produto)
- **Depende de:** #1 (auth/`/me`), #2 (personagens/`/characters`), #3 (raids, raid_players), 007 (FKs).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O dump lista um "Perfil" com: avatar, nick, personagens, pontuação PvE, Tier, histórico. Ao
explorar, a maior parte **já existe espalhada**: `/me` traz avatar/nick/role; `/characters`
lista os personagens com Tier e pontos; a `character_progression_screen` já mostra a
progressão PvE (bosses derrotados) por personagem.

No brainstorming ficou decidido: esta fatia **consolida** o que existe numa tela de perfil e
adiciona a **única peça ausente — "minhas raids"** (as raids em que o usuário está envolvido).
É o complemento pessoal do dashboard global (#7).

**Nota sobre o "Histórico" do dump:** ali "Histórico" = progressão PvE (bosses/operations/
world bosses/pontuação). Isso já tem tela por personagem; recriar um agregado duplicaria a
`character_progression_screen`, com valor questionável. Fica **fora** desta fatia (candidata a
uma própria se pedirem). "World Bosses" não existe no modelo (`bosses.type` é só
`boss`/`timer`/`lair`) — tratado como aspiracional, ignorado.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Escopo | Tela de perfil **consolidada** + endpoint **`GET /me/raids`** (única adição de backend). |
| Identidade / personagens / pontos | **Reaproveitados** de `/me` e `/characters`. Total PvE (soma dos pontos, maior Tier) **calculado no cliente** — sem endpoint agregado (YAGNI). |
| "Minhas raids" | União de raids **criadas** (`created_by`) **e** **entradas** (`raid_players`), cada uma marcada com o vínculo. |
| Fuso | Datas das raids exibidas em **local** (`.toLocal()`), coerente com o #7. |
| Acesso | `requireAuth` (o `/me/raids` é sempre do próprio `sub` do JWT). |
| Progressão PvE agregada | **Fora de escopo** (já existe por personagem). |

## Objetivos e critérios de sucesso

- Abrir o Perfil mostra avatar, nick, role; nº de personagens, total de pontos PvE e maior
  Tier; e a lista das minhas raids.
- `GET /me/raids` devolve raids que **criei** e raids em que **entrei**, cada uma uma vez, com
  `created` e `myStatus`.
- Raid que criei **e** entrei aparece uma vez, com `created:true` e `myStatus:'confirmed'`.
- Raid de outro usuário, sem minha participação, **não** aparece.
- Ordenado por `start_at` desc.
- Sem JWT → 401.
- Os 208 testes de #1–#7 seguem verdes.

## Fora de escopo

- Agregado de progressão PvE por usuário (o "Histórico" do dump — já existe por personagem).
- "World Bosses" (não modelado).
- Editar o perfil (nick/avatar vêm do Discord; não há edição no app).
- Perfil de **outros** usuários (só o próprio). Ver Riscos.
- Paginação das minhas raids (YAGNI: um usuário tem poucas dezenas).

---

## Seção 1 — Backend: `GET /me/raids`

**Repo** — novo método em `raidRepo`:
```ts
type MyRaid = {
  id: number; codigo: string; operation: string; difficulty: Difficulty; size: number;
  faction: Faction; start_at: Date; status: RaidStatus;
  created: boolean; myStatus: 'confirmed' | 'waitlist' | null;
};
listForUser(userId: number): Promise<MyRaid[]>;
```
Query única:
```sql
SELECT r.id, r.codigo, r.operation, r.difficulty, r.size, r.faction, r.start_at, r.status,
       (r.created_by = :uid) AS created, rp.status AS my_status
FROM raids r
LEFT JOIN raid_players rp ON rp.raid_id = r.id AND rp.usuario_id = :uid
WHERE r.created_by = :uid OR rp.usuario_id = :uid
ORDER BY r.start_at DESC
```
O `LEFT JOIN` na *minha* linha traz `my_status` (null se só criei). O `WHERE` cobre as duas
formas de vínculo. Como `uq_rp_raid_user` garante 1 linha por (raid, usuário), não há
duplicação. `norm`: `created: !!row.created`, `myStatus: row.my_status ?? null`,
`start_at: new Date(...)`.

**Controller/router** (`modules/profile/`): `GET /me/raids`, `requireAuth`, usa `req.user.sub`.
Montado no `createApp` só quando o dep (`raidRepo` ou um `ProfileService` fino) é passado —
padrão opcional; **#1–#7 intactos**.

> Boundary: reusa o `raidRepo` (dono das raids). O controller de profile recebe o `raidRepo`
> e chama `listForUser`. Não crio um service novo para uma query só — YAGNI.

## Seção 2 — Flutter: `ProfileScreen`

`features/profile/profile_screen.dart` — carrega em paralelo `/me`, `/characters`, `/me/raids`:
- **Cabeçalho:** `CircleAvatar` (inicial do nick), nick, role.
- **Bloco Personagens:** nº de chars; **total de pontos PvE** = soma de `total_points`; **maior
  Tier** = max de `tier` — computados da lista de `/characters`.
- **Bloco Minhas raids:** `ListView` do `/me/raids`; cada item: operation + `difficulty`,
  data via `DateTime.parse(start_at).toLocal()`, `status`, e um badge do vínculo
  (**Criador** se `created`; senão **Confirmado**/**Waitlist** por `myStatus`). Tocar → navega
  para `/raids/:id` (tela que já existe).
- Botão **"Perfil"** na `home_screen`.

Sem widget test (padrão do projeto). Verificação: `flutter analyze` + smoke manual.

## Seção 3 — Segurança & testes

**Segurança:** `/me/raids` usa **sempre** `req.user.sub` — o cliente não passa id de usuário,
então não dá para ver as raids de outro. Só expõe dados que o usuário já vê (as próprias
raids). `requireAuth` barra anônimo.

**Testes** (`profile.routes.test.ts`, supertest + fakes):
- `GET /me/raids` sem JWT → 401.
- Raid **criada** por mim → aparece com `created:true`, `myStatus:null`.
- Raid em que **entrei** (não criei) → `created:false`, `myStatus:'confirmed'` (e `'waitlist'`
  num caso).
- Raid que **criei e entrei** → uma vez, `created:true`, `myStatus:'confirmed'`.
- Raid **de outro** sem minha participação → não aparece.
- Ordenação por `start_at` desc.
- **`raidRepo.listForUser` no fake** reproduz a união + `myStatus`.
- **Regressão:** 208 testes de #1–#7 verdes.
- **Smoke real (MySQL):** criar 2 usuários + raids variadas + joins; `listForUser` de cada um
  retorna só o que lhe pertence, com os flags certos; cleanup.

## Riscos e questões em aberto

- **Perfil só do próprio usuário.** Ver o perfil de outro (ex.: tocar num jogador do ranking
  do #7) não entra aqui — exigiria expor um perfil público e decidir o que é visível. Fatia
  própria se pedirem.
- **`created` como boolean vindo do MySQL:** a expressão `(r.created_by = :uid)` volta como
  `0/1` (ou Buffer no mysql2 conforme o tipo) → o `norm` força `!!Number(row.created)`.
  Verificado no smoke real.
- **Sem paginação:** aceitável no volume atual; se um usuário acumular centenas de raids,
  vira candidato a `limit`/scroll. Anotado.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (`raidRepo.listForUser` + fake → controller/
router + wiring → tela Flutter).

---

## Apêndice — Contratos (referência)

```ts
// Alterado (db/repositories/raidRepo.ts):
export type MyRaid = {
  id: number; codigo: string; operation: string; difficulty: Difficulty; size: number;
  faction: Faction; start_at: Date; status: RaidStatus;
  created: boolean; myStatus: 'confirmed' | 'waitlist' | null;
};
listForUser(userId: number): Promise<MyRaid[]>; // no RaidRepo

// Novo (modules/profile/profile.controller.ts + profile.router.ts):
createProfileRouter(raidRepo: RaidRepo): Router; // GET /me/raids, requireAuth

// Alterado (app.ts): deps ganha
profileRaidRepo?: RaidRepo   // ou reusa um dep de raid já passado
```
