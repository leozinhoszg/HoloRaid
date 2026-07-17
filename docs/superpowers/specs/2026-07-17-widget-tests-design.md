# HoloRaid — Widget tests (harness + RaidFormScreen) — Design

- **Data:** 2026-07-17
- **Subsistema:** qualidade / testes de UI (não é feature)
- **Depende de:** o app Flutter existente (Riverpod, go_router), a `RaidFormScreen` (criar/editar).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

As últimas fatias (Painel Admin, Edição de raid) foram UI-only e acumularam telas Flutter
**sem nenhum teste automatizado** — a confiança veio só de `flutter analyze` (que não exercita
comportamento) + smoke de backend + smoke manual. O app tem apenas um `widget_test.dart`
trivial (monta o app) e **nenhuma dependência de mock**.

Esta fatia **estabelece o padrão de widget test** (fakes à mão + `ProviderScope` overrides +
harness de router) e cobre a tela mais recente e de maior lógica — a `RaidFormScreen`
(criar/editar). `flutter test` roda **headless**, então é a **primeira cobertura automatizada
real de tela** do projeto.

**Achado de testabilidade:** telas de raids/characters usam **repositórios** (fáceis de
fakear via override do provider). Já dashboard/profile/admin chamam `apiClientProvider.dio`
**direto** — mais difíceis de testar sem refatorar. Por isso o alvo é a `RaidFormScreen`
(usa `raidsRepositoryProvider`), deixando as telas dio-direto para uma fatia futura.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alvo | **Harness + `RaidFormScreen`** (criar e editar). Não testar tudo agora. |
| Mock | **Fakes escritos à mão** (`implements RaidsRepository`), **sem dependência nova** — mesmo espírito dos `fakeRepos.ts` do backend. |
| Injeção | `ProviderScope(overrides:)` — `raidsRepositoryProvider` → fake; `operationsProvider` → lista canned. |
| Navegação | Harness com `GoRouter` mínimo (`/` dummy + `/form`) para o `context.pop()` do save ter para onde voltar. |
| Testabilidade | `ValueKey` nos 4 dropdowns imutáveis (para asserir o lock em edição). Mudança mínima. |
| Escopo futuro | dashboard/profile/admin (dio-direto) e outras telas ficam para depois, já com o padrão pronto. |

## Objetivos e critérios de sucesso

- `flutter test` roda e passa: **5 testes novos** + o mount existente.
- Cobrem a lógica real da `RaidFormScreen`:
  - criar renderiza (título, switch "Disable mentions", botão);
  - guarda de slots (soma ≠ size → botão desabilitado);
  - criar salva → chama `create` no repo;
  - editar preenche + trava os imutáveis + esconde o switch;
  - editar salva → chama `update(id, payload)` com as chaves editáveis.
- O `create` (`/raids/new`) e o `edit` continuam funcionando (analyze limpo).
- Padrão reutilizável documentado por exemplo (o próprio harness).

## Fora de escopo

- Telas dio-direto (dashboard, profile, admin) — exigiriam refatorar para repositórios.
- Outras telas (raids list, characters, detail com socket) — próxima fatia.
- Testes de integração fim-a-fim / golden tests.
- Mockar o socket (`socketServiceProvider`) — a `RaidFormScreen` não o usa.
- Qualquer mudança de backend.

## Seção 1 — Harness (`app/test/support/`)

**`fake_raids_repository.dart`** — `class FakeRaidsRepository implements RaidsRepository`:
- Campos: `List<Map<String,dynamic>> createCalls`, `List<(int, Map<String,dynamic>)> updateCalls`,
  `Raid? getResult` (o `Raid` que `get()` devolve na edição).
- `create(body)` → grava em `createCalls` e devolve um `Raid` dummy.
- `update(id, body)` → grava `(id, body)` e devolve um `Raid` dummy.
- `get(id)` → devolve `getResult!`.
- Demais métodos (`list/getByCodigo/remove/join/leave/transition/duplicate`) e o campo `api` →
  `UnimplementedError` / getter que lança (não são chamados nestes testes).

**`pump_raid_form.dart`** — helper:
```dart
Future<FakeRaidsRepository> pumpRaidForm(WidgetTester tester, {
  int? editRaidId, Raid? existing, List<String> operations = const ['Dread Palace', 'Dread Fortress'],
});
```
Monta um `FakeRaidsRepository` (com `getResult = existing`), um `GoRouter`
(`/` → `Scaffold()`, `/form` → `RaidFormScreen(editRaidId: editRaidId)`), e um
`ProviderScope(overrides: [raidsRepositoryProvider.overrideWithValue(fake),
operationsProvider.overrideWith((ref) async => operations)])` em volta de
`MaterialApp.router`. Navega para `/form`, `await tester.pumpAndSettle()`, retorna o fake.

## Seção 2 — Testabilidade no `raid_form_screen.dart`

Adicionar `key: const ValueKey('f_operation')`, `'f_difficulty'`, `'f_size'`, `'f_faction'`
aos 4 `DropdownButtonFormField` imutáveis. É o único toque na tela — permite
`tester.widget<DropdownButtonFormField<String>>(find.byKey(const ValueKey('f_operation'))).onChanged`
ser `null` em edição. Nenhuma mudança de comportamento.

## Seção 3 — Testes (`app/test/features/raids/raid_form_screen_test.dart`)

1. **criar renderiza:** `pumpRaidForm(tester)` → `find.text('Criar raid')` (AppBar+botão),
   `find.widgetWithText(SwitchListTile, 'Disable mentions')` presente.
2. **guarda de slots:** criar (8 players, 2/2/4). `tester.tap(find.byIcon(Icons.add).first)` (Tank+ →
   soma 9). `pump()`. O `FilledButton` com texto 'Criar raid' tem `onPressed == null`.
3. **criar salva:** criar. `tester.tap(find.widgetWithText(FilledButton, 'Criar raid'))`.
   `pumpAndSettle()`. `fake.createCalls` tem length 1, com `operation`/`slots_*` no body.
4. **editar preenche + trava:** `pumpRaidForm(editRaidId: 7, existing: <Raid canned: notes 'lockme',
   size 16, minTier 3>)` → `find.text('Editar raid')`, `find.widgetWithText(FilledButton, 'Salvar')`,
   `find.text('lockme')` (notes), **`find.widgetWithText(SwitchListTile, 'Disable mentions')`
   ausente**, e o dropdown `f_operation` com `onChanged == null`.
5. **editar salva:** editar (como #4). `tester.tap(find.widgetWithText(FilledButton, 'Salvar'))`.
   `pumpAndSettle()`. `fake.updateCalls` tem 1 entrada com id 7 e body contendo `minimum_tier`,
   `slots_tank`, `start_at`.

O `Raid` canned dos testes 4/5 é construído via `Raid(...)` (o modelo tem construtor público).

## Seção 4 — Segurança & verificação

Não há superfície de segurança (é teste). Verificação:
- **`flutter test`** verde: 6 testes (1 mount + 5 novos). Confirmar que o runner roda no
  ambiente (headless, sem device).
- **`flutter analyze`** limpo (o harness e o ajuste de keys não introduzem lint).
- **Regressão:** os 211 testes de backend seguem verdes (backend intacto).

## Riscos e questões em aberto

- **`implements RaidsRepository`** obriga implementar todos os membros, incl. o campo `api`
  (vira getter). Stub com `UnimplementedError` nos não-usados — se um teste futuro chamar um
  método stubado, falha clara.
- **`context.pop()` no save** precisa de um `GoRouter` ancestral — resolvido pelo harness
  (`/` dummy). Sem ele, o save lançaria.
- **`operationsProvider` é `FutureProvider`** — o override devolve `Future`; o `pumpAndSettle`
  aguarda a resolução antes das asserções.
- **Não cobre navegação real** (o pop volta para o `/` dummy) — aceitável; o foco é a lógica do
  form, não o roteamento do app.
- **Primeira fatia de widget test:** se o `flutter test` tiver algum atrito de ambiente
  (ex.: fontes, tamanho de tela), ajustar (ex.: `tester.view.physicalSize`) — anotado.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (keys de testabilidade → harness → testes →
`flutter test`).

---

## Apêndice — Contratos (referência)

```dart
// Novo (test/support/fake_raids_repository.dart):
class FakeRaidsRepository implements RaidsRepository {
  final List<Map<String, dynamic>> createCalls = [];
  final List<({int id, Map<String, dynamic> body})> updateCalls = [];
  Raid? getResult;
  // create/update gravam e devolvem Raid dummy; get devolve getResult; resto -> UnimplementedError.
}

// Novo (test/support/pump_raid_form.dart):
Future<FakeRaidsRepository> pumpRaidForm(WidgetTester tester, { int? editRaidId, Raid? existing, List<String> operations });

// Alterado (raid_form_screen.dart): ValueKey('f_operation'|'f_difficulty'|'f_size'|'f_faction')
//   nos 4 dropdowns imutáveis. Nada mais.
```
