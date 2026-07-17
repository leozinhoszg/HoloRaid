# Painel Administrativo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor na UI Flutter os poderes de admin que o backend já autoriza — gestão de qualquer raid (incl. duplicar/excluir) e gestão de usuários (promover/rebaixar).

**Architecture:** 100% Flutter, zero backend. O `raid_detail_screen` mostra o bloco de gestão para líder **ou** admin e ganha Duplicar/Excluir (repo já tem os métodos). Um `AdminRepository` + `UsersAdminScreen` reusam `GET /users` e promote/demote. Botão "Admin" na home só para admin.

**Tech Stack:** Flutter (Riverpod, go_router, Dio). Nenhuma mudança de backend.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-admin-panel-design.md`.
- **NENHUMA mudança de backend** (endpoint/service/migration/teste). Tudo já existe.
- **Gating no Flutter é cosmético** — a defesa real é o backend (`requireAdmin`, `canManage`). Não mover verificação para o cliente.
- **`iAmAdmin`** = `auth is AuthSignedIn && auth.user['role'] == 'admin'`.
- **Excluir raid** pede confirmação e ao concluir volta: `context.canPop() ? context.pop() : context.go('/raids')` + invalida `raidsListProvider`.
- **"Editar raid" fica FORA** (não há form de edição no app, nem para líder). As demais ações do dump ficam cobertas.
- **Regressão:** os **211 testes de backend seguem verdes SEM MUDANÇA** (nada de backend muda).
- **Verificação desta fatia:** `flutter analyze` limpo + smoke manual (não há teste automatizado novo — é UI sobre backend já testado).
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Flutter roda em `app/`. Verificação: `cd app && flutter analyze` → `No issues found!`.

---

### Task 1: AdminRepository + provider

**Files:**
- Create: `app/lib/features/admin/admin_repository.dart`

**Interfaces:**
- Consumes: `apiClientProvider` (`core/auth/auth_providers.dart`), endpoints `GET /users`, `POST /users/:id/promote`, `POST /users/:id/demote` (todos já existentes, admin-gated).
- Produces:
  - `class AdminRepository { Future<List<Map<String, dynamic>>> listUsers(); Future<void> promote(int id); Future<void> demote(int id); }`
  - `final adminRepositoryProvider = Provider<AdminRepository>(...)`

- [ ] **Step 1: Criar o repositório**

Crie `app/lib/features/admin/admin_repository.dart`:

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/network/api_client.dart';

class AdminRepository {
  AdminRepository(this._api);
  final ApiClient _api;

  Future<List<Map<String, dynamic>>> listUsers() async {
    final res = await _api.dio.get('/users');
    return (res.data as List).map((e) => (e as Map).cast<String, dynamic>()).toList();
  }

  Future<void> promote(int id) => _api.dio.post('/users/$id/promote');
  Future<void> demote(int id) => _api.dio.post('/users/$id/demote');
}

final adminRepositoryProvider = Provider<AdminRepository>((ref) => AdminRepository(ref.watch(apiClientProvider)));
```

- [ ] **Step 2: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!` (o arquivo compila; ainda sem uso — o analyzer não reclama de provider não usado).

- [ ] **Step 3: Commit**

```bash
git add app/lib/features/admin/admin_repository.dart
git commit -m "feat(app): AdminRepository (list/promote/demote)"
```

---

### Task 2: UsersAdminScreen + rota

**Files:**
- Create: `app/lib/features/admin/users_admin_screen.dart`
- Modify: `app/lib/core/router/app_router.dart`

**Interfaces:**
- Consumes: `adminRepositoryProvider` (Task 1).
- Produces: rota `/admin/users`.

- [ ] **Step 1: Criar a tela**

Crie `app/lib/features/admin/users_admin_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'admin_repository.dart';

class UsersAdminScreen extends ConsumerStatefulWidget {
  const UsersAdminScreen({super.key});
  @override
  ConsumerState<UsersAdminScreen> createState() => _UsersAdminScreenState();
}

class _UsersAdminScreenState extends ConsumerState<UsersAdminScreen> {
  late Future<List<Map<String, dynamic>>> _users;

  @override
  void initState() {
    super.initState();
    _users = ref.read(adminRepositoryProvider).listUsers();
  }

  void _reload() => setState(() { _users = ref.read(adminRepositoryProvider).listUsers(); });

  Future<void> _act(Future<void> Function() action) async {
    try {
      await action();
      _reload();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Falha: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Usuários (admin)')),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _users,
        builder: (context, snap) {
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final users = snap.data!;
          return RefreshIndicator(
            onRefresh: () async { _reload(); await _users; },
            child: ListView(
              children: users.map((u) {
                final id = u['id'] as int;
                final role = u['role'] as String? ?? 'user';
                final isAdmin = role == 'admin';
                return ListTile(
                  leading: CircleAvatar(child: Text((u['username'] as String? ?? '?').substring(0, 1).toUpperCase())),
                  title: Text(u['username'] as String? ?? '—'),
                  subtitle: Text(role),
                  trailing: isAdmin
                      ? OutlinedButton(onPressed: () => _act(() => ref.read(adminRepositoryProvider).demote(id)), child: const Text('Rebaixar'))
                      : FilledButton(onPressed: () => _act(() => ref.read(adminRepositoryProvider).promote(id)), child: const Text('Promover')),
                );
              }).toList(),
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: Registrar a rota**

Em `app/lib/core/router/app_router.dart`, adicione o import e a rota:

```dart
import '../../features/admin/users_admin_screen.dart';
```
```dart
      GoRoute(path: '/admin/users', builder: (_, _) => const UsersAdminScreen()),
```

- [ ] **Step 3: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 4: Commit**

```bash
git add app/lib/features/admin/users_admin_screen.dart app/lib/core/router/app_router.dart
git commit -m "feat(app): tela de gestao de usuarios (promover/rebaixar)"
```

---

### Task 3: Botões de admin no raid detail + entrada na home

**Files:**
- Modify: `app/lib/features/raids/raid_detail_screen.dart`
- Modify: `app/lib/features/home/home_screen.dart`

**Interfaces:**
- Consumes: `raidsRepository` (já tem `duplicate`/`remove`/`transition`), `authStateProvider`.
- Produces: nada (folha).

- [ ] **Step 1: Imports e admin flag no raid detail**

Em `app/lib/features/raids/raid_detail_screen.dart`, adicione o import do `go_router` (para `context.go`) no topo, junto dos outros:

```dart
import 'package:go_router/go_router.dart';
```

No `build`, logo depois de `final iAmLeader = meId != null && raid.createdBy == meId;`, adicione:

```dart
          final iAmAdmin = auth is AuthSignedIn && (auth.user['role'] as String?) == 'admin';
```

- [ ] **Step 2: Bloco de gestão para líder OU admin + Duplicar/Excluir**

Substitua o bloco `if (iAmLeader) Wrap(...)` por:

```dart
              if (iAmLeader || iAmAdmin) Wrap(spacing: 8, children: [
                if (raid.status == 'OPEN') TextButton(onPressed: () => _transition(context, ref, 'start'), child: const Text('Iniciar')),
                if (raid.status == 'OPEN' || raid.status == 'RUNNING') TextButton(onPressed: () => _transition(context, ref, 'finish'), child: const Text('Encerrar')),
                if (raid.status == 'OPEN' || raid.status == 'RUNNING') TextButton(onPressed: () => _transition(context, ref, 'cancel'), child: const Text('Cancelar')),
                TextButton(onPressed: () => _duplicate(context, ref), child: const Text('Duplicar')),
                TextButton(onPressed: () => _delete(context, ref), style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error), child: const Text('Excluir')),
              ]),
```

- [ ] **Step 3: Handlers de duplicar e excluir**

Adicione os dois métodos à classe (depois de `_transition`):

```dart
  Future<void> _duplicate(BuildContext context, WidgetRef ref) async {
    try {
      final copy = await ref.read(raidsRepositoryProvider).duplicate(id);
      ref.invalidate(raidsListProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Raid duplicada (${copy.codigo}).')));
        context.push('/raids/${copy.id}');
      }
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Falha ao duplicar: $e')));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Excluir raid?'),
        content: const Text('Esta ação não pode ser desfeita.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Excluir')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(raidsRepositoryProvider).remove(id);
      ref.invalidate(raidsListProvider);
      if (context.mounted) context.canPop() ? context.pop() : context.go('/raids');
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Falha ao excluir: $e')));
    }
  }
```

> `_transition`, `_duplicate` e `_delete` recebem `(context, ref)` mas usam `id` (campo do
> widget) — coerente com os handlers existentes (`_leave`, `_transition`).

- [ ] **Step 4: Botão "Admin" na home (só para admin)**

Em `app/lib/features/home/home_screen.dart`, no `build`, o `me` já vem do `FutureBuilder`
(`loadMe()`), que traz `role`. Depois do botão "Perfil", adicione:

```dart
                if ((me['role'] as String?) == 'admin') ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => context.push('/admin/users'),
                    icon: const Icon(Icons.admin_panel_settings),
                    label: const Text('Admin'),
                  ),
                ],
```

- [ ] **Step 5: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 6: Commit**

```bash
git add app/lib/features/raids/raid_detail_screen.dart app/lib/features/home/home_screen.dart
git commit -m "feat(app): gestao de raid para admin (duplicar/excluir) + entrada Admin na home"
```

---

### Task 4: Verificação final

**Files:** nenhum (verificação).

- [ ] **Step 1: Backend intacto (nada mudou, mas confirmamos)**

Run: `cd backend && npm test 2>&1 | grep -E "Tests |Test Files"`
Expected: **211 passed** — nenhum arquivo de backend foi tocado nesta fatia.

- [ ] **Step 2: Flutter analyze**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 3: Smoke manual (o que valida a fatia)**

Requer o app rodando com um usuário **admin** e um **comum** (o role vem do `ADMIN_DISCORD_IDS`
no login, ou via promote). Verifique:
1. **Admin** abre uma raid criada por outro → vê Iniciar/Encerrar/Cancelar/Duplicar/Excluir;
   Duplicar cria cópia e navega; Excluir confirma → volta à lista e a raid some.
2. **Admin** abre **/admin** (botão na home) → lista de usuários → Promover um `user` (vira
   admin) → Rebaixar de volta; auto-rebaixar → snackbar de erro (400 do backend).
3. **Comum** → **não** vê o botão Admin na home nem os botões de gestão numa raid alheia; e,
   como prova server-side, um `DELETE /raids/:id` forjado de raid alheia responde **403**.

> **Se não houver ambiente com admin configurado, reporte o smoke como pendente** — não marque
> como verificado. A confiança automatizada vem do backend já testado (#1/#3) + `flutter analyze`.

- [ ] **Step 4: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "chore(admin): ajustes do smoke do painel administrativo"
```

---

## Notas de execução

- **Branch:** `feat/admin-panel`, merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** 1 → 2 → 3 → 4.
- **Fatia UI-only:** sem TDD de backend (não há lógica nova). A verificação é `flutter analyze` + smoke manual; seja honesto no relatório final sobre o que foi/não foi visto por olho humano.
- **Não toque em backend.** Se sentir vontade de "melhorar" um endpoint, é outra fatia.
