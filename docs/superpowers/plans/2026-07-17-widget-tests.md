# Widget tests (harness + RaidFormScreen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer o padrão de widget test (fakes à mão + ProviderScope overrides + harness de router) e cobrir a `RaidFormScreen` (criar/editar) com testes reais que `flutter test` roda headless.

**Architecture:** Sem dependência nova. `FakeRaidsRepository` (implements RaidsRepository) grava chamadas; `pumpRaidForm` monta `ProviderScope` com overrides + um `GoRouter` mínimo para o `context.pop()` do save funcionar. `ValueKey` nos 4 dropdowns imutáveis permite asserir o lock em edição.

**Tech Stack:** Flutter (`flutter_test`, Riverpod, go_router). Zero backend.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-widget-tests-design.md`.
- **Nenhuma dependência nova** (só `flutter_test`, já presente). Fakes à mão.
- **Nenhuma mudança de backend.** Os 211 testes de backend seguem verdes.
- **Único toque em código de produção:** `ValueKey` nos 4 dropdowns imutáveis do `raid_form_screen` — nada de comportamento.
- **Verificação:** `flutter test` verde (1 mount + 5 novos) **e** `flutter analyze` limpo.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Flutter em `app/`. Testes: `cd app && flutter test`. Lint: `cd app && flutter analyze`.

---

### Task 1: Keys de testabilidade nos dropdowns imutáveis

**Files:**
- Modify: `app/lib/features/raids/raid_form_screen.dart`

**Interfaces:**
- Produces: os 4 `DropdownButtonFormField` imutáveis ganham `key: const ValueKey('f_operation'|'f_difficulty'|'f_size'|'f_faction')`.

- [ ] **Step 1: Adicionar as keys**

Em `app/lib/features/raids/raid_form_screen.dart`, adicione `key:` ao **primeiro parâmetro** de cada um dos 4 dropdowns imutáveis:

- Operation:
```dart
                  DropdownButtonFormField<String>(
                    key: const ValueKey('f_operation'),
                    initialValue: _operation,
```
- Difficulty:
```dart
                  DropdownButtonFormField<String>(
                    key: const ValueKey('f_difficulty'),
                    initialValue: _difficulty,
```
- Size:
```dart
                  DropdownButtonFormField<int>(
                    key: const ValueKey('f_size'),
                    initialValue: _size,
```
- Facção:
```dart
                  DropdownButtonFormField<String>(
                    key: const ValueKey('f_faction'),
                    initialValue: _faction,
```

> **Não** adicione key aos dropdowns editáveis (Tier mínimo). Só os 4 imutáveis.

- [ ] **Step 2: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add app/lib/features/raids/raid_form_screen.dart
git commit -m "chore(app): ValueKey nos dropdowns imutaveis do form (testabilidade)"
```

---

### Task 2: Harness de teste (fake repo + pumpRaidForm)

**Files:**
- Create: `app/test/support/fake_raids_repository.dart`
- Create: `app/test/support/pump_raid_form.dart`

**Interfaces:**
- Consumes: `RaidsRepository`, `Raid`, `raidsRepositoryProvider`, `operationsProvider`, `RaidFormScreen`.
- Produces:
  - `class FakeRaidsRepository implements RaidsRepository { List<Map<String,dynamic>> createCalls; List<({int id, Map<String,dynamic> body})> updateCalls; Raid? getResult; }`
  - `Future<FakeRaidsRepository> pumpRaidForm(WidgetTester, { int? editRaidId, Raid? existing, List<String> operations })`

- [ ] **Step 1: Criar o fake repo**

Crie `app/test/support/fake_raids_repository.dart`:

```dart
import 'package:holoraid/core/network/api_client.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import 'package:holoraid/features/raids/raids_repository.dart';

Raid _dummy(int id) => Raid(
      id: id, codigo: 'DUMMY', operation: 'Dread Palace', difficulty: 'HM', size: 8,
      faction: 'Republic', minimumTier: 0, checkComposition: false,
      slotsTank: 2, slotsHeal: 2, slotsDps: 4, notes: null,
      startAt: DateTime.utc(2026, 8, 1, 20, 30), status: 'OPEN', createdBy: 1,
    );

class FakeRaidsRepository implements RaidsRepository {
  final List<Map<String, dynamic>> createCalls = [];
  final List<({int id, Map<String, dynamic> body})> updateCalls = [];
  Raid? getResult;

  @override
  Future<Raid> create(Map<String, dynamic> body) async { createCalls.add(body); return _dummy(1); }

  @override
  Future<Raid> update(int id, Map<String, dynamic> body) async { updateCalls.add((id: id, body: body)); return _dummy(id); }

  @override
  Future<Raid> get(int id) async => getResult ?? _dummy(id);

  // Não usados nestes testes:
  @override
  ApiClient get api => throw UnimplementedError();
  @override
  Future<List<Raid>> list({String? status}) => throw UnimplementedError();
  @override
  Future<Raid> getByCodigo(String codigo) => throw UnimplementedError();
  @override
  Future<void> remove(int id) => throw UnimplementedError();
  @override
  Future<String> join(int id, int personagemId) => throw UnimplementedError();
  @override
  Future<void> leave(int id) => throw UnimplementedError();
  @override
  Future<Raid> transition(int id, String action) => throw UnimplementedError();
  @override
  Future<Raid> duplicate(int id) => throw UnimplementedError();
}
```

> Se o analyzer apontar um membro faltando/sobrando em `implements RaidsRepository`, alinhe
> exatamente com `app/lib/features/raids/raids_repository.dart` (métodos: `list`, `get`,
> `getByCodigo`, `create`, `update`, `remove`, `join`, `leave`, `transition`, `duplicate`, e o
> campo `api`).

- [ ] **Step 2: Criar o helper de pump**

Crie `app/test/support/pump_raid_form.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/core/reference/reference_providers.dart';
import 'package:holoraid/features/raids/raid_form_screen.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import 'package:holoraid/features/raids/raids_providers.dart';
import 'fake_raids_repository.dart';

Future<FakeRaidsRepository> pumpRaidForm(
  WidgetTester tester, {
  int? editRaidId,
  Raid? existing,
  List<String> operations = const ['Dread Palace', 'Dread Fortress'],
}) async {
  final fake = FakeRaidsRepository()..getResult = existing;
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, __) => const Scaffold(body: SizedBox())),
      GoRoute(path: '/form', builder: (_, __) => RaidFormScreen(editRaidId: editRaidId)),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        raidsRepositoryProvider.overrideWithValue(fake),
        operationsProvider.overrideWith((ref) async => operations),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  router.push('/form');
  await tester.pumpAndSettle();
  return fake;
}
```

- [ ] **Step 3: Verificar (compila)**

Run: `cd app && flutter analyze`
Expected: `No issues found!` (os arquivos de `test/` são analisados).

- [ ] **Step 4: Commit**

```bash
git add app/test/support/fake_raids_repository.dart app/test/support/pump_raid_form.dart
git commit -m "test(app): harness de widget test (fake repo + pumpRaidForm)"
```

---

### Task 3: Os 5 testes da RaidFormScreen

**Files:**
- Create: `app/test/features/raids/raid_form_screen_test.dart`

**Interfaces:**
- Consumes: `pumpRaidForm`, `FakeRaidsRepository`, `Raid`.

- [ ] **Step 1: Escrever os testes**

Crie `app/test/features/raids/raid_form_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import '../../support/pump_raid_form.dart';

Raid _raid({String notes = 'lockme', int size = 16, int minTier = 3}) => Raid(
      id: 7, codigo: 'AB12', operation: 'Dread Fortress', difficulty: 'NiM', size: size,
      faction: 'Empire', minimumTier: minTier, checkComposition: false,
      slotsTank: 2, slotsHeal: 4, slotsDps: 10, notes: notes,
      startAt: DateTime.utc(2026, 8, 1, 20, 30), status: 'OPEN', createdBy: 1,
    );

void main() {
  testWidgets('criar: renderiza titulo, switch e botao', (tester) async {
    await pumpRaidForm(tester);
    expect(find.text('Criar raid'), findsWidgets); // AppBar + botão
    expect(find.widgetWithText(SwitchListTile, 'Disable mentions'), findsOneWidget);
  });

  testWidgets('criar: guarda de slots desabilita o botao quando soma != size', (tester) async {
    await pumpRaidForm(tester);
    // 8 players, default 2/2/4 = 8 -> habilitado
    var btn = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Criar raid'));
    expect(btn.onPressed, isNotNull);
    // Tank + -> soma 9 != 8 -> desabilitado
    await tester.ensureVisible(find.byIcon(Icons.add).first);
    await tester.tap(find.byIcon(Icons.add).first);
    await tester.pump();
    btn = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Criar raid'));
    expect(btn.onPressed, isNull);
  });

  testWidgets('criar: salvar chama create no repo', (tester) async {
    final fake = await pumpRaidForm(tester);
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Criar raid'));
    await tester.tap(find.widgetWithText(FilledButton, 'Criar raid'));
    await tester.pumpAndSettle();
    expect(fake.createCalls, hasLength(1));
    expect(fake.createCalls.first['operation'], isNotNull);
    expect(fake.createCalls.first['slots_tank'], 2);
  });

  testWidgets('editar: preenche, esconde switch e trava os imutaveis', (tester) async {
    await pumpRaidForm(tester, editRaidId: 7, existing: _raid());
    expect(find.text('Editar raid'), findsOneWidget); // AppBar
    expect(find.widgetWithText(FilledButton, 'Salvar'), findsOneWidget);
    expect(find.text('lockme'), findsOneWidget); // notes prefilled
    expect(find.widgetWithText(SwitchListTile, 'Disable mentions'), findsNothing);
    final op = tester.widget<DropdownButtonFormField<String>>(find.byKey(const ValueKey('f_operation')));
    expect(op.onChanged, isNull); // imutável travado
  });

  testWidgets('editar: salvar chama update com id e payload', (tester) async {
    final fake = await pumpRaidForm(tester, editRaidId: 7, existing: _raid());
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Salvar'));
    await tester.tap(find.widgetWithText(FilledButton, 'Salvar'));
    await tester.pumpAndSettle();
    expect(fake.updateCalls, hasLength(1));
    expect(fake.updateCalls.first.id, 7);
    final body = fake.updateCalls.first.body;
    expect(body.containsKey('minimum_tier'), isTrue);
    expect(body.containsKey('slots_tank'), isTrue);
    expect(body.containsKey('start_at'), isTrue);
    expect(body.containsKey('operation'), isFalse); // imutável não vai no payload
  });
}
```

> **Nota sobre o teste 4 (edit):** o `Raid` canned tem `size: 16` com slots `2/4/10 = 16`, então
> o botão "Salvar" nasce habilitado (soma == size). O `notes: 'lockme'` aparece no `TextField`
> como texto — `find.text('lockme')` o encontra.

- [ ] **Step 2: Rodar os testes**

Run: `cd app && flutter test`
Expected: **todos passam** — 6 testes (o `widget_test.dart` de mount + os 5 novos). Se algum
falhar, leia a mensagem: causas comuns e correções abaixo.

> **Se o `find.text('Criar raid')` casar demais/de menos:** o texto aparece no AppBar e no
> botão → use `findsWidgets` (já é o caso). Para o "Editar raid" só há o AppBar → `findsOneWidget`.
>
> **Se `find.byIcon(Icons.add).first` não achar:** os steppers usam `Icons.add`; há 3 (tank/heal/
> dps) → `.first` é o Tank. OK.
>
> **Se o save do teste 3/5 estourar em `context.pop()`:** confirme que o harness usa
> `GoRouter` com a rota `/` (o pop volta para lá). Já está no `pumpRaidForm`.
>
> **Se `flutter test` reclamar de tamanho de tela / overflow:** widget tests usam 800x600 por
> padrão; a tela é `ListView` (rola), então não deve dar overflow. Se der, o teste ainda passa
> (overflow é warning de render, não falha de teste), mas para limpar: `tester.view.physicalSize
> = const Size(1200, 2000); tester.view.devicePixelRatio = 1.0;` no início e
> `addTearDown(tester.view.reset)`.

- [ ] **Step 3: Commit**

```bash
git add app/test/features/raids/raid_form_screen_test.dart
git commit -m "test(app): widget tests da RaidFormScreen (criar/editar, 5 casos)"
```

---

### Task 4: Verificação final

**Files:** nenhum (verificação).

- [ ] **Step 1: `flutter test` completo**

Run: `cd app && flutter test`
Expected: **All tests passed!** — 6 testes (1 mount + 5 novos), 0 falhas. **É a primeira
cobertura automatizada de tela do projeto.**

- [ ] **Step 2: `flutter analyze` limpo**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 3: Backend intacto**

Run: `cd backend && npm test 2>&1 | grep -E "Tests |Test Files"`
Expected: **211 passed** (nada de backend mudou).

- [ ] **Step 4: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "chore(app): ajustes dos widget tests"
```

---

## Notas de execução

- **Branch:** `feat/widget-tests`, merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** 1 → 2 → 3 → 4. A Task 3 depende do harness (Task 2) e das keys (Task 1).
- **`flutter test` roda headless** (sem device/emulador). Se por algum motivo o runner não subir
  no ambiente, **reporte** — mas o esperado é rodar normalmente (é o test runner padrão do Dart).
- **Zero backend.** Se sentir vontade de refatorar dashboard/profile/admin para repos (torná-las
  testáveis), é a **próxima** fatia, não esta.
