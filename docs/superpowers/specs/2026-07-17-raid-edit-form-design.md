# HoloRaid — Editar raid na UI — Design

- **Data:** 2026-07-17
- **Subsistema:** Editar raid (fecha o gap "Editar raids" do dump/Painel Admin)
- **Depende de:** #3 (`PATCH /raids/:id`, `raidUpdateSchema`, `raidService.update`), Painel Admin (bloco de gestão no `raid_detail_screen`).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O Painel Administrativo deixou "Editar raid" de fora porque **não existe tela de edição** —
nem para o líder. O backend, porém, está pronto e testado desde o #3: `PATCH /raids/:id`
(`raidUpdateSchema`) + `raidService.update`, que valida líder/admin, raid **OPEN**, slots
somando o size e não abaixo dos confirmados. O `raids_repository` (Flutter) já tem
`update(id, body)`.

Esta fatia é **Flutter-only, zero backend**: uma tela de edição reusando o form de criação.

**Campos editáveis** (o que o `raidUpdateSchema` aceita): `minimum_tier`, `check_composition`,
`slots_tank/heal/dps`, `notes`, `start_at` (data+hora).
**Campos imutáveis** (por design — mudá-los quebraria o roster): `operation`, `difficulty`,
`size`, `faction`.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alcance | **100% Flutter.** Nenhum endpoint/schema/service/teste de backend novo. |
| Tela | **Reuso do `RaidFormScreen`** parametrizado com um id de edição opcional (DRY: steppers de slot e pickers de data/hora são idênticos). |
| Imutáveis | operation/difficulty/size/faction ficam **read-only** (exibidos como contexto, não escondidos). |
| Entrada | Botão **"Editar"** no bloco de gestão do `raid_detail_screen` (líder ou admin), **só quando `status == 'OPEN'`** (espelha o backend). Rota `/raids/:id/edit`. |
| Save | Em edição, `update(id, {editáveis})` em vez de `create`. |
| Erros | 409/422 do backend → snackbar; guarda local de "slots somam o size" (como na criação). |
| Prefill | O form busca a raid por id (`raidsRepository.get`) — funciona também via deep link. |

## Objetivos e critérios de sucesso

- Líder/admin abre uma raid **OPEN** → botão "Editar" → tela pré-preenchida.
- operation/difficulty/size/faction aparecem, mas **não são editáveis**.
- Alterar minimum_tier/check_composition/slots/notes/data/hora → Salvar → a raid atualiza (e
  reflete ao vivo no app via socket, sem reload).
- Reduzir slots abaixo dos confirmados → **erro claro** (409), sem gravar.
- Slots não somando o size → salvar bloqueado localmente + (defesa) 422 do backend.
- Raid não-OPEN → o botão "Editar" **não aparece**; e (server-side) o PATCH responde 409.
- Só líder/admin vê "Editar" (server-side: 403 para outros).
- Criar raid (`/raids/new`) **continua idêntico** — o modo default do form não muda.
- Os 211 testes de backend seguem verdes **sem mudança**.
- `flutter analyze` limpo.

## Fora de escopo

- Mudar operation/difficulty/size/faction (imutáveis por design).
- Backend novo (tudo existe).
- Editar raid via Discord já existe (`/edit_raid`, #5b) — não mexe.
- Gerenciar roster/composição pela tela de edição.

## Seção 1 — Entrada (`raid_detail_screen.dart`)

No bloco `if (iAmLeader || iAmAdmin)` (do Painel Admin), adicionar um botão **"Editar"**
**condicionado a `raid.status == 'OPEN'`**:
```dart
if (raid.status == 'OPEN') TextButton(onPressed: () => context.push('/raids/${raid.id}/edit'), child: const Text('Editar')),
```

## Seção 2 — Tela (`raid_form_screen.dart` parametrizado)

`RaidFormScreen` ganha `final int? editRaidId;` (default `null`).
- **`null` → criar:** comportamento atual, intacto.
- **preenchido → editar:**
  - `initState`: se `editRaidId != null`, busca `raidsRepository.get(editRaidId)` e preenche os
    campos (operation, difficulty, size, faction, minTier, checkComp, slots, notes, data, hora);
    enquanto carrega, mostra spinner.
  - `bool get _isEdit => widget.editRaidId != null`.
  - Imutáveis: em `_isEdit`, os 4 dropdowns viram **texto read-only** (ou dropdowns
    `onChanged: null`); o stepper de size não aplica defaults.
  - AppBar: "Editar raid" vs "Criar raid".
  - Botão: "Salvar" vs "Criar raid".
  - `_save`: em `_isEdit`, monta o payload **só com os editáveis** e chama
    `update(editRaidId!, payload)`; senão, `create(payload)` como hoje.
  - Após sucesso: `invalidate(raidsListProvider)` + (edit) `invalidate(raidDetailProvider(id))`
    + `context.pop()`.

Payload de edição (chaves do `raidUpdateSchema`):
```dart
{ 'minimum_tier': _minTier, 'check_composition': _checkComp,
  'slots_tank': _tank, 'slots_heal': _heal, 'slots_dps': _dps,
  'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
  'start_at': startAt.toIso8601String() }
```

## Seção 3 — Rota (`app_router.dart`)

```dart
GoRoute(path: '/raids/:id/edit', builder: (_, state) => RaidFormScreen(editRaidId: int.parse(state.pathParameters['id']!))),
```
Sem conflito com `/raids/new` (literal, casa antes) nem `/raids/:id` (2 segmentos vs 3).

## Seção 4 — Segurança & testes

**Segurança:** o gating de UI (botão só p/ líder/admin e só OPEN) é conveniência; a defesa real
é `canManage` + `status==='OPEN'` no `raidService.update` (já testados no #3). Um PATCH forjado
por não-líder → 403; de raid não-OPEN → 409. **Nada movido para o cliente.**

**Testes:**
- **Backend:** **nenhum novo** — `raidService.update` já é coberto pelo #3 (líder/admin,
  OPEN-only, slots somam size, slots ≥ confirmados). Os **211 seguem verdes sem mudança**.
- **Verificação reforçada desta fatia (a pedido: "verificar todos os erros"):** um **smoke real
  contra o MySQL** exercita o `raidService.update` com **o payload exato que o form envia**,
  cobrindo os 4 caminhos:
  1. edição válida (muda minTier/slots/notes/start_at) → grava e relê.
  2. slots não somam o size → `ValidationError` (o 422 do backend).
  3. slots abaixo dos confirmados (com um join real) → `ValidationError` (409 na rota).
  4. raid não-OPEN → `ConflictError` (409).
  (Isto prova o **contrato** que a tela depende, já que a tela em si não tem teste
  automatizado.)
- **Flutter:** sem widget test (padrão do projeto). `flutter analyze` limpo.
- **Smoke manual:** editar uma raid OPEN e ver refletir ao vivo; tentar os erros acima na UI.

## Riscos e questões em aberto

- **Terceira fatia UI-only seguida** (admin, edição) → verificação automatizada fraca no
  Flutter. Mitigado nesta por: backend já testado + o smoke reforçado do contrato + analyze.
  Um ciclo de **widget tests** fecharia o gap de vez — fatia própria, anotada.
- **Reuso do form vs tela nova:** reuso é DRY mas adiciona `_isEdit` em vários pontos. Se o
  form crescer demais, vale extrair; hoje é aceitável (a tela é pequena).
- **Corrida OPEN→não-OPEN:** entre abrir o form e salvar, a raid pode sair de OPEN (outro
  admin). O backend revalida no `update` (fonte da verdade) → 409 → snackbar. Sem lock.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (parametrizar o form → rota → botão Editar →
smoke reforçado do contrato).

---

## Apêndice — Contratos (referência)

```dart
// Alterado (raid_form_screen.dart):
class RaidFormScreen extends ConsumerStatefulWidget {
  final int? editRaidId;                 // null = criar; !=null = editar
  const RaidFormScreen({super.key, this.editRaidId});
}
// _isEdit, prefill via raidsRepository.get, save via update(id, {editáveis}) vs create.

// Rota nova: GoRoute('/raids/:id/edit')
// raid_detail: botão "Editar" no bloco de gestão, só se status=='OPEN'.
// Backend: INTACTO (PATCH /raids/:id + raidUpdateSchema + raidService.update já existem).
```
