# Widget tests do raid_detail (gating) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrir com widget tests a visibilidade dos botões de gestão da `RaidDetailScreen` (líder/admin/status), criando no caminho o fake de socket + auth reutilizável.

**Architecture:** `FakeSocketService` (no-op) + `FakeAuthNotifier` (auth injetável) + `pumpRaidDetail` (overrides de repo/socket/auth num GoRouter mínimo). O `raidDetailProvider` real roda sobre os fakes. Zero mudança de produção.

**Tech Stack:** Flutter (`flutter_test`, Riverpod, go_router). Zero backend. Sem dependência nova.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-raid-detail-widget-tests-design.md`.
- **Zero mudança de produção** (a `RaidDetailScreen` não muda; botões achados por texto único).
- **Sem dependência nova** (fakes à mão).
- **Reusa** `FakeRaidsRepository` e o padrão do harness anterior.
- **Testar visibilidade, não ação** (o backend/smoke já cobre update/delete).
- **Regressão:** `flutter test` verde (6 atuais + 4 novos = 10); backend 211 intacto.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Flutter em `app/`. Testes: `cd app && flutter test`. Lint: `cd app && flutter analyze` → `No issues found!`.

---

### Task 1: Fakes de socket e auth

**Files:**
- Create: `app/test/support/fake_socket_service.dart`
- Create: `app/test/support/fake_auth_notifier.dart`

**Interfaces:**
- Consumes: `SocketService`, `RaidEvent` (`core/realtime/socket_service.dart`); `AuthNotifier`, `AuthState` (`core/auth/auth_providers.dart`).
- Produces: `FakeSocketService`, `FakeAuthNotifier`.

- [ ] **Step 1: Fake do socket**

Crie `app/test/support/fake_socket_service.dart`:

```dart
import 'package:holoraid/core/auth/token_storage.dart';
import 'package:holoraid/core/realtime/socket_service.dart';

class FakeSocketService implements SocketService {
  @override
  Stream<RaidEvent> get events => const Stream.empty();

  @override
  void connect() {}
  @override
  void subscribeRaid(int id) {}
  @override
  void unsubscribeRaid(int id) {}
  @override
  void subscribeLobby() {}
  @override
  void unsubscribeLobby() {}
  @override
  void dispose() {}

  @override
  TokenStorage get storage => throw UnimplementedError();
}
```

> Se o analyzer apontar membro faltando (ex.: um método novo em `SocketService`), alinhe com
> `app/lib/core/realtime/socket_service.dart`. Hoje os públicos são: `events`, `connect`,
> `subscribeRaid`, `unsubscribeRaid`, `subscribeLobby`, `unsubscribeLobby`, `dispose`, `storage`.

- [ ] **Step 2: Fake do auth notifier**

Crie `app/test/support/fake_auth_notifier.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:holoraid/core/auth/auth_providers.dart';

class FakeAuthNotifier extends AuthNotifier {
  FakeAuthNotifier(Ref ref, AuthState initial) : super(ref) {
    state = initial;
  }
}
```

- [ ] **Step 3: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 4: Commit**

```bash
git add app/test/support/fake_socket_service.dart app/test/support/fake_auth_notifier.dart
git commit -m "test(app): fakes de socket e auth para widget tests"
```

---

### Task 2: Helper `pumpRaidDetail`

**Files:**
- Create: `app/test/support/pump_raid_detail.dart`

**Interfaces:**
- Consumes: `FakeRaidsRepository`, `FakeSocketService`, `FakeAuthNotifier`, `RaidDetailScreen`, `raidsRepositoryProvider`, `socketServiceProvider`, `authStateProvider`.
- Produces: `Future<void> pumpRaidDetail(WidgetTester, { required Raid raid, required int authUserId, required String authRole })`.

- [ ] **Step 1: Criar o helper**

Crie `app/test/support/pump_raid_detail.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/core/auth/auth_providers.dart';
import 'package:holoraid/core/realtime/socket_service.dart';
import 'package:holoraid/features/raids/raid_detail_screen.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import 'package:holoraid/features/raids/raids_providers.dart';
import 'fake_auth_notifier.dart';
import 'fake_raids_repository.dart';
import 'fake_socket_service.dart';

Future<void> pumpRaidDetail(
  WidgetTester tester, {
  required Raid raid,
  required int authUserId,
  required String authRole,
}) async {
  tester.view.physicalSize = const Size(1200, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final fake = FakeRaidsRepository()..getResult = raid;
  final router = GoRouter(
    initialLocation: '/detail',
    routes: [
      GoRoute(path: '/detail', builder: (_, _) => RaidDetailScreen(id: raid.id)),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        raidsRepositoryProvider.overrideWithValue(fake),
        socketServiceProvider.overrideWithValue(FakeSocketService()),
        authStateProvider.overrideWith(
          (ref) => FakeAuthNotifier(ref, AuthSignedIn({'id': authUserId, 'role': authRole})),
        ),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}
```

> `socketServiceProvider` é um `Provider` → `overrideWithValue`. `authStateProvider` é um
> `StateNotifierProvider` → `overrideWith((ref) => notifier)`.

- [ ] **Step 2: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add app/test/support/pump_raid_detail.dart
git commit -m "test(app): helper pumpRaidDetail (overrides de repo/socket/auth)"
```

---

### Task 3: Os 4 testes de gating

**Files:**
- Create: `app/test/features/raids/raid_detail_screen_test.dart`

**Interfaces:**
- Consumes: `pumpRaidDetail`, `Raid`.

- [ ] **Step 1: Escrever os testes**

Crie `app/test/features/raids/raid_detail_screen_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import '../../support/pump_raid_detail.dart';

Raid _raid({String status = 'OPEN'}) => Raid(
      id: 5, codigo: 'AB12', operation: 'Dread Palace', difficulty: 'HM', size: 8,
      faction: 'Republic', minimumTier: 0, checkComposition: false,
      slotsTank: 2, slotsHeal: 2, slotsDps: 4, notes: null,
      startAt: DateTime.utc(2026, 8, 1, 20, 30), status: status, createdBy: 100,
    );

void main() {
  testWidgets('comum: nao ve botoes de gestao', (tester) async {
    await pumpRaidDetail(tester, raid: _raid(), authUserId: 999, authRole: 'user');
    expect(find.text('Editar'), findsNothing);
    expect(find.text('Iniciar'), findsNothing);
    expect(find.text('Duplicar'), findsNothing);
    expect(find.text('Excluir'), findsNothing);
    expect(find.text('Compartilhar'), findsOneWidget); // não é gestão
  });

  testWidgets('lider (OPEN): ve todos os botoes de gestao', (tester) async {
    await pumpRaidDetail(tester, raid: _raid(), authUserId: 100, authRole: 'user');
    expect(find.text('Editar'), findsOneWidget);
    expect(find.text('Iniciar'), findsOneWidget);
    expect(find.text('Encerrar'), findsOneWidget);
    expect(find.text('Cancelar'), findsOneWidget);
    expect(find.text('Duplicar'), findsOneWidget);
    expect(find.text('Excluir'), findsOneWidget);
  });

  testWidgets('admin nao-lider (OPEN): ve gestao por override', (tester) async {
    await pumpRaidDetail(tester, raid: _raid(), authUserId: 999, authRole: 'admin');
    expect(find.text('Editar'), findsOneWidget);
    expect(find.text('Duplicar'), findsOneWidget);
    expect(find.text('Excluir'), findsOneWidget);
  });

  testWidgets('lider (RUNNING): esconde Editar/Iniciar, mantem o resto', (tester) async {
    await pumpRaidDetail(tester, raid: _raid(status: 'RUNNING'), authUserId: 100, authRole: 'user');
    expect(find.text('Editar'), findsNothing);   // só OPEN
    expect(find.text('Iniciar'), findsNothing);  // só OPEN
    expect(find.text('Encerrar'), findsOneWidget);
    expect(find.text('Cancelar'), findsOneWidget);
    expect(find.text('Duplicar'), findsOneWidget);
    expect(find.text('Excluir'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Rodar os testes**

Run: `cd app && flutter test test/features/raids/raid_detail_screen_test.dart`
Expected: **4 testes passam**. Se algum falhar:

> **Se `find.text('Editar')` não achar no teste do líder:** verifique se o
> `raidDetailProvider` resolveu (o fake `get` devolve `getResult`) e o auth foi injetado
> (`AuthSignedIn({'id': 100, ...})` → `meId == createdBy`). O botão só renderiza dentro de
> `if (iAmLeader || iAmAdmin)`.
>
> **Se sobrar botão no teste do comum:** confirme que `authUserId != createdBy` e `authRole !=
> 'admin'`.
>
> **Se der overflow / widget do fim não encontrado:** o viewport alto já está no helper; os
> botões de gestão ficam no topo (após o cabeçalho), então devem estar visíveis.

- [ ] **Step 3: Commit**

```bash
git add app/test/features/raids/raid_detail_screen_test.dart
git commit -m "test(app): widget tests do gating de gestao no raid_detail (4 casos)"
```

---

### Task 4: Verificação final

**Files:** nenhum (verificação).

- [ ] **Step 1: `flutter test` completo**

Run: `cd app && flutter test`
Expected: **All tests passed!** — 10 testes (6 anteriores + 4 novos), 0 falhas.

- [ ] **Step 2: `flutter analyze`**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 3: Backend intacto**

Run: `cd backend && npm test 2>&1 | grep -E "Tests |Test Files"` e `cd /d/HoloRaid && git diff master --stat -- backend/`
Expected: **211 passed** e diff de `backend/` **vazio**.

- [ ] **Step 4: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "chore(app): ajustes dos widget tests do raid_detail"
```

---

## Notas de execução

- **Branch:** `feat/raid-detail-tests`, merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** 1 → 2 → 3 → 4. A Task 3 depende dos fakes (1) e do helper (2).
- **Zero backend, zero mudança de produção.** É pura infra de teste.
- **`FakeSocketService` fica reutilizável** para a `RaidsListScreen` numa fatia futura.
