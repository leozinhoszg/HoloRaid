# App Shell — Navegação lateral + menu de usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um app shell responsivo (sidebar no desktop, Drawer no mobile) + menu de usuário, e limpar a Home do que virou redundante.

**Architecture:** Um `ShellRoute` do go_router envolve os destinos principais em `AppShell`, que decide sidebar (≥900px) vs Drawer (<900px). Sidebar/Drawer/UserMenu compartilham uma lista central de destinos. As telas-destino viram "body-only" (o Scaffold é do shell).

**Tech Stack:** Flutter, go_router (ShellRoute), Riverpod, MenuAnchor, core/ui existente (HoloAvatar, HoloWordmark, HoloPalette).

## Global Constraints

- **Breakpoint:** `wide = maxWidth >= 900`.
- **Paleta/fontes:** `HoloPalette` + Orbitron (títulos) / Aldrich (labels) / Jura (texto). Reusar `HoloAvatar`, `HoloWordmark`.
- **Destinos:** Início `/home`, Personagens `/characters`, Raids `/raids`, Dashboard `/dashboard`, Admin `/admin/users` (só `role==admin`).
- **Menu do usuário:** Perfil · Reduzir animações (toggle → `reduceMotionProvider`) · Admin (se admin) · Sair.
- **Fora do shell (full-screen, back):** `/login`, `/characters/new`, `/characters/:id`, `/characters/:id/progression`, `/raids/new`, `/raids/:id`, `/raids/:id/edit`, `/profile`.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`, sem `Co-Authored-By`.
- **Flutter pelo PowerShell.** Gate por tarefa: `flutter analyze` limpo + `flutter test` verde.

## File Structure

- Create `app/lib/core/nav/nav_destinations.dart` — `NavDestination`, `navDestinations`, `isDestinationActive`, `NavFab`, `fabForLocation`, `titleForLocation`.
- Create `app/lib/core/nav/nav_tile.dart` — `NavTile` (item de menu compartilhado).
- Create `app/lib/core/nav/holo_user_menu.dart` — `HoloUserMenu`.
- Create `app/lib/core/nav/holo_sidebar.dart` — `HoloSidebar`.
- Create `app/lib/core/nav/holo_drawer.dart` — `HoloDrawer`.
- Create `app/lib/core/nav/app_shell.dart` — `AppShell`.
- Modify `app/lib/core/router/app_router.dart` — `ShellRoute`.
- Modify `characters_list_screen.dart`, `raids_list_screen.dart`, `dashboard_screen.dart`, `users_admin_screen.dart` — body-only.
- Modify `app/lib/features/home/home_screen.dart` — remove top bar + nav grid.
- Delete `app/lib/features/home/widgets/home_top_bar.dart`, `nav_grid.dart` (movidos/obsoletos).
- Tests: `app/test/core/nav/nav_destinations_test.dart`, `holo_user_menu_test.dart`, `app_shell_test.dart`; ajustar `home_screen_test.dart`.

---

### Task 1: `NavDestinations` — config e helpers

**Files:**
- Create: `app/lib/core/nav/nav_destinations.dart`
- Test: `app/test/core/nav/nav_destinations_test.dart`

**Interfaces:**
- Produces:
  - `class NavDestination { final String route, label; final IconData icon; final Color color; }`
  - `List<NavDestination> navDestinations({required bool isAdmin})`
  - `bool isDestinationActive(String route, String location)`
  - `class NavFab { final String label; final IconData icon; final String route; }`
  - `NavFab? fabForLocation(String location)`
  - `String titleForLocation(String location)`

- [ ] **Step 1: Teste falho** `nav_destinations_test.dart`:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/nav/nav_destinations.dart';

void main() {
  test('admin oculto para user, visível para admin', () {
    expect(navDestinations(isAdmin: false).any((d) => d.route == '/admin/users'), isFalse);
    expect(navDestinations(isAdmin: true).any((d) => d.route == '/admin/users'), isTrue);
  });
  test('destino ativo por prefixo, exceto home exato', () {
    expect(isDestinationActive('/raids', '/raids'), isTrue);
    expect(isDestinationActive('/raids', '/raids/5'), isTrue);
    expect(isDestinationActive('/home', '/home'), isTrue);
    expect(isDestinationActive('/home', '/raids'), isFalse);
    expect(isDestinationActive('/characters', '/raids'), isFalse);
  });
  test('fab só em characters e raids', () {
    expect(fabForLocation('/characters')!.route, '/characters/new');
    expect(fabForLocation('/raids')!.route, '/raids/new');
    expect(fabForLocation('/dashboard'), isNull);
    expect(fabForLocation('/home'), isNull);
  });
  test('titulo por localização', () {
    expect(titleForLocation('/characters'), 'Personagens');
    expect(titleForLocation('/raids/5'), 'Raids');
    expect(titleForLocation('/desconhecido'), 'HoloRaid');
  });
}
```

- [ ] **Step 2: Rodar** `flutter test test/core/nav/nav_destinations_test.dart` → FAIL.

- [ ] **Step 3: Implementar** `nav_destinations.dart`:
```dart
import 'package:flutter/material.dart';
import '../ui/holo_palette.dart';

class NavDestination {
  final String route, label;
  final IconData icon;
  final Color color;
  const NavDestination({required this.route, required this.label, required this.icon, required this.color});
}

List<NavDestination> navDestinations({required bool isAdmin}) => [
      const NavDestination(route: '/home', label: 'Início', icon: Icons.dashboard_outlined, color: HoloPalette.indigo),
      const NavDestination(route: '/characters', label: 'Personagens', icon: Icons.people_alt_outlined, color: HoloPalette.indigo),
      const NavDestination(route: '/raids', label: 'Raids', icon: Icons.calendar_month_outlined, color: HoloPalette.blue),
      const NavDestination(route: '/dashboard', label: 'Dashboard', icon: Icons.bar_chart, color: HoloPalette.heal),
      if (isAdmin) const NavDestination(route: '/admin/users', label: 'Admin', icon: Icons.shield_outlined, color: HoloPalette.red),
    ];

bool isDestinationActive(String route, String location) =>
    route == '/home' ? location == '/home' : location.startsWith(route);

class NavFab {
  final String label;
  final IconData icon;
  final String route;
  const NavFab(this.label, this.icon, this.route);
}

NavFab? fabForLocation(String location) {
  if (location == '/characters') return const NavFab('Novo', Icons.add, '/characters/new');
  if (location == '/raids') return const NavFab('Criar raid', Icons.add, '/raids/new');
  return null;
}

/// Título da seção; usa o primeiro destino cujo route casa (admin incluído p/ resolver /admin/*).
String titleForLocation(String location) {
  for (final d in navDestinations(isAdmin: true)) {
    if (isDestinationActive(d.route, location)) return d.label;
  }
  return 'HoloRaid';
}
```

- [ ] **Step 4: Rodar** → PASS. `flutter analyze` limpo.

- [ ] **Step 5: Commit**
```bash
git add app/lib/core/nav/nav_destinations.dart app/test/core/nav/nav_destinations_test.dart
git commit -m "feat(app): NavDestinations (config e helpers de navegacao)"
```

---

### Task 2: `NavTile` — item de menu compartilhado

**Files:**
- Create: `app/lib/core/nav/nav_tile.dart`
- Test: (coberto indiretamente pela sidebar/drawer; sem teste dedicado)

**Interfaces:**
- Consumes: `NavDestination`, `HoloPalette`.
- Produces: `NavTile({required NavDestination dest, required bool active, required VoidCallback onTap})`.

- [ ] **Step 1: Implementar** `nav_tile.dart`:
```dart
import 'package:flutter/material.dart';
import '../ui/holo_palette.dart';
import 'nav_destinations.dart';

class NavTile extends StatelessWidget {
  const NavTile({super.key, required this.dest, required this.active, required this.onTap});
  final NavDestination dest;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: active ? const Color(0x1A76C8FF) : Colors.transparent,
              border: Border.all(color: active ? HoloPalette.glassBorderStrong : Colors.transparent),
            ),
            child: Row(children: [
              Container(
                width: 3, height: 20,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(2),
                  color: active ? dest.color : Colors.transparent,
                ),
              ),
              const SizedBox(width: 12),
              Icon(dest.icon, size: 20, color: active ? dest.color : HoloPalette.dim),
              const SizedBox(width: 14),
              Text(dest.label,
                  style: TextStyle(
                    fontFamily: 'Aldrich', fontSize: 13, letterSpacing: .5,
                    color: active ? HoloPalette.ink : HoloPalette.dim,
                  )),
            ]),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 2:** `flutter analyze` limpo.

- [ ] **Step 3: Commit**
```bash
git add app/lib/core/nav/nav_tile.dart
git commit -m "feat(app): NavTile (item de navegacao com estado ativo)"
```

---

### Task 3: `HoloUserMenu` — menu do usuário

**Files:**
- Create: `app/lib/core/nav/holo_user_menu.dart`
- Test: `app/test/core/nav/holo_user_menu_test.dart`

**Interfaces:**
- Consumes: `meProvider`, `reduceMotionProvider`, `authStateProvider`, `HoloAvatar`, `HoloPalette`.
- Produces: `HoloUserMenu({double avatarSize})`.

- [ ] **Step 1: Teste falho** `holo_user_menu_test.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/core/nav/holo_user_menu.dart';
import 'package:holoraid/core/settings/settings_providers.dart';
import 'package:holoraid/features/home/home_providers.dart';

Widget _app(List<Override> o) => ProviderScope(
    overrides: o,
    child: MaterialApp.router(
        routerConfig: GoRouter(routes: [
      GoRoute(path: '/', builder: (_, _) => const Scaffold(body: HoloUserMenu())),
      GoRoute(path: '/profile', builder: (_, _) => const Scaffold()),
    ])));

List<Override> _ov({required String role}) => [
      meProvider.overrideWith((ref) async => {'username': 'ana', 'role': role, 'discord_id': null, 'avatar': null}),
    ];

void main() {
  testWidgets('abre e mostra Perfil e Sair; Admin oculto p/ user', (tester) async {
    await tester.pumpWidget(_app(_ov(role: 'user')));
    await tester.pump();
    await tester.tap(find.byType(HoloUserMenu));
    await tester.pumpAndSettle();
    expect(find.text('Perfil'), findsOneWidget);
    expect(find.text('Sair'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
  });

  testWidgets('toggle Reduzir animações altera o provider', (tester) async {
    final container = ProviderContainer(overrides: _ov(role: 'user'));
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(routerConfig: GoRouter(routes: [
        GoRoute(path: '/', builder: (_, _) => const Scaffold(body: HoloUserMenu())),
      ])),
    ));
    await tester.pump();
    await tester.tap(find.byType(HoloUserMenu));
    await tester.pumpAndSettle();
    expect(container.read(reduceMotionProvider), isFalse);
    await tester.tap(find.text('Reduzir animações'));
    await tester.pump();
    expect(container.read(reduceMotionProvider), isTrue);
  });
}
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar** `holo_user_menu.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_providers.dart';
import '../settings/settings_providers.dart';
import '../ui/holo_avatar.dart';
import '../ui/holo_palette.dart';
import '../../features/home/home_providers.dart';

class HoloUserMenu extends ConsumerWidget {
  const HoloUserMenu({super.key, this.avatarSize = 38});
  final double avatarSize;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).valueOrNull ?? const {};
    final name = me['username'] as String? ?? '—';
    final role = (me['role'] as String? ?? 'user');
    final isAdmin = role == 'admin';
    final discordId = me['discord_id']?.toString();
    final avatar = me['avatar'] as String?;
    final url = (discordId != null && avatar != null && avatar.isNotEmpty)
        ? 'https://cdn.discordapp.com/avatars/$discordId/$avatar.png' : null;

    return MenuAnchor(
      style: MenuStyle(
        backgroundColor: const WidgetStatePropertyAll(Color(0xF2101430)),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        elevation: const WidgetStatePropertyAll(10),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(vertical: 6)),
        minimumSize: const WidgetStatePropertyAll(Size(220, 0)),
        shape: WidgetStatePropertyAll(RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: HoloPalette.glassBorderStrong),
        )),
      ),
      alignmentOffset: const Offset(-160, 6),
      builder: (context, controller, child) => InkWell(
        borderRadius: BorderRadius.circular(30),
        onTap: () => controller.isOpen ? controller.close() : controller.open(),
        child: HoloAvatar(url: url, label: name, size: avatarSize),
      ),
      menuChildren: [
        _item(context, Icons.person_outline, 'Perfil', () => context.push('/profile')),
        _ReduceMotionItem(),
        if (isAdmin) _item(context, Icons.shield_outlined, 'Admin', () => context.push('/admin/users')),
        const Divider(height: 8, color: HoloPalette.glassBorder),
        _item(context, Icons.logout, 'Sair', () => ref.read(authStateProvider.notifier).logout(), danger: true),
      ],
    );
  }

  Widget _item(BuildContext context, IconData icon, String label, VoidCallback onTap, {bool danger = false}) {
    final color = danger ? HoloPalette.red : HoloPalette.ink;
    return MenuItemButton(
      onPressed: onTap,
      leadingIcon: Icon(icon, size: 18, color: danger ? HoloPalette.red : HoloPalette.dim),
      style: ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(Size(220, 42)),
        padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 14)),
        overlayColor: const WidgetStatePropertyAll(Color(0x2276C8FF)),
        textStyle: const WidgetStatePropertyAll(TextStyle(fontFamily: 'Jura', fontSize: 14)),
        foregroundColor: WidgetStatePropertyAll(color),
      ),
      child: Align(alignment: Alignment.centerLeft, child: Text(label)),
    );
  }
}

/// Item com Switch que NÃO fecha o menu ao alternar (não é MenuItemButton).
class _ReduceMotionItem extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final on = ref.watch(reduceMotionProvider);
    return InkWell(
      onTap: () => ref.read(reduceMotionProvider.notifier).state = !on,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Row(children: [
          const Icon(Icons.motion_photos_pause_outlined, size: 18, color: HoloPalette.dim),
          const SizedBox(width: 12),
          const Expanded(child: Text('Reduzir animações', style: TextStyle(fontFamily: 'Jura', fontSize: 14, color: HoloPalette.ink))),
          Switch(value: on, onChanged: (v) => ref.read(reduceMotionProvider.notifier).state = v),
        ]),
      ),
    );
  }
}
```

- [ ] **Step 4: Rodar** `flutter test test/core/nav/holo_user_menu_test.dart` → PASS. `flutter analyze` limpo.

- [ ] **Step 5: Commit**
```bash
git add app/lib/core/nav/holo_user_menu.dart app/test/core/nav/holo_user_menu_test.dart
git commit -m "feat(app): HoloUserMenu (Perfil, reduzir animacoes, admin, sair)"
```

---

### Task 4: `HoloSidebar` + `HoloDrawer`

**Files:**
- Create: `app/lib/core/nav/holo_sidebar.dart`, `app/lib/core/nav/holo_drawer.dart`

**Interfaces:**
- Consumes: `meProvider`, `navDestinations`, `isDestinationActive`, `NavTile`, `HoloWordmark`, `HoloAvatar`, go_router (`GoRouterState.of`, `context.go`).
- Produces: `HoloSidebar()`, `HoloDrawer()`.

- [ ] **Step 1: Implementar** `holo_sidebar.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../ui/holo_palette.dart';
import '../ui/holo_wordmark.dart';
import '../../features/home/home_providers.dart';
import 'nav_destinations.dart';
import 'nav_tile.dart';

class HoloSidebar extends ConsumerWidget {
  const HoloSidebar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAdmin = (ref.watch(meProvider).valueOrNull?['role']) == 'admin';
    final location = GoRouterState.of(context).matchedLocation;
    final dests = navDestinations(isAdmin: isAdmin);
    return Container(
      width: 240,
      decoration: const BoxDecoration(
        color: Color(0x66101430),
        border: Border(right: BorderSide(color: HoloPalette.glassBorder)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Padding(padding: EdgeInsets.fromLTRB(20, 24, 20, 24), child: HoloWordmark(size: 26)),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.only(top: 4),
            children: dests
                .map((d) => NavTile(
                      dest: d,
                      active: isDestinationActive(d.route, location),
                      onTap: () => context.go(d.route),
                    ))
                .toList(),
          ),
        ),
      ]),
    );
  }
}
```

- [ ] **Step 2: Implementar** `holo_drawer.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../ui/holo_avatar.dart';
import '../ui/holo_palette.dart';
import '../../features/home/home_providers.dart';
import 'nav_destinations.dart';
import 'nav_tile.dart';

class HoloDrawer extends ConsumerWidget {
  const HoloDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(meProvider).valueOrNull ?? const {};
    final name = me['username'] as String? ?? '—';
    final role = (me['role'] as String? ?? 'user');
    final isAdmin = role == 'admin';
    final discordId = me['discord_id']?.toString();
    final avatar = me['avatar'] as String?;
    final url = (discordId != null && avatar != null && avatar.isNotEmpty)
        ? 'https://cdn.discordapp.com/avatars/$discordId/$avatar.png' : null;
    final location = GoRouterState.of(context).matchedLocation;
    final dests = navDestinations(isAdmin: isAdmin);

    return Drawer(
      backgroundColor: const Color(0xF20B0F28),
      shape: const RoundedRectangleBorder(),
      child: SafeArea(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
            child: Row(children: [
              HoloAvatar(url: url, label: name, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontFamily: 'Aldrich', fontSize: 14, color: HoloPalette.ink)),
                  Text(role.toUpperCase(),
                      style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 2, color: HoloPalette.indigo)),
                ]),
              ),
            ]),
          ),
          const Divider(height: 1, color: HoloPalette.glassBorder),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.only(top: 8),
              children: dests
                  .map((d) => NavTile(
                        dest: d,
                        active: isDestinationActive(d.route, location),
                        onTap: () {
                          Navigator.of(context).pop(); // fecha o drawer
                          context.go(d.route);
                        },
                      ))
                  .toList(),
            ),
          ),
        ]),
      ),
    );
  }
}
```

- [ ] **Step 3:** `flutter analyze` limpo.

- [ ] **Step 4: Commit**
```bash
git add app/lib/core/nav/holo_sidebar.dart app/lib/core/nav/holo_drawer.dart
git commit -m "feat(app): HoloSidebar e HoloDrawer (navegacao glass)"
```

---

### Task 5: `AppShell` responsivo

**Files:**
- Create: `app/lib/core/nav/app_shell.dart`
- Test: `app/test/core/nav/app_shell_test.dart`

**Interfaces:**
- Consumes: `meProvider`, `HoloSidebar`, `HoloDrawer`, `HoloUserMenu`, `fabForLocation`, `titleForLocation`, go_router.
- Produces: `AppShell({required Widget child})`.

- [ ] **Step 1: Teste falho** `app_shell_test.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/core/nav/app_shell.dart';
import 'package:holoraid/features/home/home_providers.dart';

GoRouter _router() => GoRouter(initialLocation: '/home', routes: [
      ShellRoute(
        builder: (_, __, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (_, _) => const Text('HOME-BODY')),
          GoRoute(path: '/characters', builder: (_, _) => const Text('CHARS-BODY')),
          GoRoute(path: '/raids', builder: (_, _) => const Text('RAIDS-BODY')),
          GoRoute(path: '/dashboard', builder: (_, _) => const Text('DASH-BODY')),
          GoRoute(path: '/admin/users', builder: (_, _) => const Text('ADMIN-BODY')),
        ],
      ),
    ]);

Widget _app(List<Override> o) => ProviderScope(overrides: o, child: MaterialApp.router(routerConfig: _router()));

List<Override> _ov({required String role}) =>
    [meProvider.overrideWith((ref) async => {'username': 'ana', 'role': role, 'discord_id': null, 'avatar': null})];

void main() {
  testWidgets('wide: sidebar com destinos; Admin oculto p/ user', (tester) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(_ov(role: 'user')));
    await tester.pump();
    expect(find.text('Personagens'), findsOneWidget);
    expect(find.text('Raids'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
    expect(find.text('HOME-BODY'), findsOneWidget);
  });

  testWidgets('wide admin: Admin visível', (tester) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(_ov(role: 'admin')));
    await tester.pump();
    expect(find.text('Admin'), findsOneWidget);
  });

  testWidgets('narrow: hambúrguer abre Drawer com destinos', (tester) async {
    tester.view.physicalSize = const Size(420, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(_ov(role: 'user')));
    await tester.pump();
    expect(find.text('Personagens'), findsNothing); // escondido no drawer fechado
    await tester.tap(find.byIcon(Icons.menu));
    await tester.pumpAndSettle();
    expect(find.text('Personagens'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Rodar** → FAIL.

- [ ] **Step 3: Implementar** `app_shell.dart`:
```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../ui/holo_palette.dart';
import 'holo_drawer.dart';
import 'holo_sidebar.dart';
import 'holo_user_menu.dart';
import 'nav_destinations.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;
    final title = titleForLocation(location);
    final fab = fabForLocation(location);
    final fabWidget = fab == null
        ? null
        : FloatingActionButton.extended(
            onPressed: () => context.push(fab.route),
            icon: Icon(fab.icon),
            label: Text(fab.label, style: const TextStyle(fontFamily: 'Aldrich', letterSpacing: 1)),
          );

    return LayoutBuilder(builder: (context, c) {
      final wide = c.maxWidth >= 900;
      if (wide) {
        return Scaffold(
          floatingActionButton: fabWidget,
          body: SafeArea(
            child: Row(children: [
              const HoloSidebar(),
              Expanded(
                child: Column(children: [
                  _TopBar(title: title),
                  Expanded(child: child),
                ]),
              ),
            ]),
          ),
        );
      }
      return Scaffold(
        appBar: AppBar(
          title: Text(title),
          actions: const [Padding(padding: EdgeInsets.only(right: 12), child: Center(child: HoloUserMenu()))],
        ),
        drawer: const HoloDrawer(),
        floatingActionButton: fabWidget,
        body: SafeArea(child: child),
      );
    });
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(28, 18, 20, 14),
      child: Row(children: [
        Text(title, style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 22, color: HoloPalette.ink)),
        const Spacer(),
        const HoloUserMenu(),
      ]),
    );
  }
}
```
> Nota: no narrow, o `AppBar` mostra o **título da seção** (mais útil que o wordmark; o wordmark aparece no header do Drawer). Refinamento consciente sobre o spec.

- [ ] **Step 4: Rodar** `flutter test test/core/nav/app_shell_test.dart` → PASS. `flutter analyze` limpo.

- [ ] **Step 5: Commit**
```bash
git add app/lib/core/nav/app_shell.dart app/test/core/nav/app_shell_test.dart
git commit -m "feat(app): AppShell responsivo (sidebar/drawer + user menu + fab)"
```

---

### Task 6: Router `ShellRoute` + telas-destino body-only

**Files:**
- Modify: `app/lib/core/router/app_router.dart`
- Modify: `characters_list_screen.dart`, `raids_list_screen.dart`, `dashboard_screen.dart`, `users_admin_screen.dart`

**Interfaces:**
- Consumes: `AppShell`.

- [ ] **Step 1: Router — envolver os 5 destinos num `ShellRoute`.** Em `app_router.dart`, adicionar `import '../nav/app_shell.dart';` e substituir os `GoRoute`s de `/home`, `/characters`, `/raids`, `/dashboard`, `/admin/users` por um `ShellRoute`:
```dart
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
          GoRoute(path: '/characters', builder: (_, _) => const CharactersListScreen()),
          GoRoute(path: '/raids', builder: (_, _) => const RaidsListScreen()),
          GoRoute(path: '/dashboard', builder: (_, _) => const DashboardScreen()),
          GoRoute(path: '/admin/users', builder: (_, _) => const UsersAdminScreen()),
        ],
      ),
      GoRoute(path: '/characters/new', builder: (_, _) => const CharacterFormScreen()),
      GoRoute(path: '/characters/:id', builder: (_, state) => CharacterProfileScreen(id: int.parse(state.pathParameters['id']!))),
      GoRoute(path: '/characters/:id/progression', builder: (_, state) => CharacterProgressionScreen(id: int.parse(state.pathParameters['id']!))),
      GoRoute(path: '/raids/new', builder: (_, _) => const RaidFormScreen()),
      GoRoute(path: '/raids/:id/edit', builder: (_, state) => RaidFormScreen(editRaidId: int.parse(state.pathParameters['id']!))),
      GoRoute(path: '/raids/:id', builder: (_, state) => RaidDetailScreen(id: int.parse(state.pathParameters['id']!))),
      GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
    ],
```

- [ ] **Step 2: `CharactersListScreen` body-only.** Remover o `Scaffold`/`AppBar`/`FAB`, retornar direto o `chars.when(...)`:
```dart
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chars = ref.watch(charactersProvider);
    return chars.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Erro: $e')),
      data: (list) => list.isEmpty
          ? const Center(child: Text('Nenhum personagem ainda. Crie o primeiro!'))
          : RefreshIndicator(
              onRefresh: () async => ref.refresh(charactersProvider.future),
              child: ListView.builder(
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final c = list[i];
                  return Card(
                    margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: ListTile(
                      onTap: () => context.push('/characters/${c.id}'),
                      leading: CircleAvatar(child: Text(c.role[0])),
                      title: Text(c.nome),
                      subtitle: Text('${c.classe} · ${c.role} · iLvl ${c.itemLevel}'),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Chip(label: Text(c.tier == 0 ? 'Sem Tier' : 'Tier ${c.tier}')),
                          Text('${c.totalPoints} pts', style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
```

- [ ] **Step 3: `RaidsListScreen` body-only.** Remover `Scaffold`/`AppBar`/`FAB`, retornar direto o `raids.when(...)` (mesmo corpo atual, sem o wrapper Scaffold).

- [ ] **Step 4: `DashboardScreen` body-only.** Remover `Scaffold`/`AppBar`; retornar direto o `FutureBuilder(...)` (o corpo atual, mantendo o `Center/ConstrainedBox`).

- [ ] **Step 5: `UsersAdminScreen` body-only.** Remover `Scaffold`/`AppBar`; retornar direto o `FutureBuilder(...)`. `ScaffoldMessenger.of(context)` continua válido (Scaffold do shell é ancestral).

- [ ] **Step 6: Rodar** `flutter analyze` (limpo) e `flutter test` (verde — nenhum teste dessas telas). Buildar e conferir manualmente que não há duplo AppBar.

- [ ] **Step 7: Commit**
```bash
git add app/lib/core/router/app_router.dart app/lib/features/characters/characters_list_screen.dart app/lib/features/raids/raids_list_screen.dart app/lib/features/dashboard/dashboard_screen.dart app/lib/features/admin/users_admin_screen.dart
git commit -m "feat(app): ShellRoute + telas-destino body-only (sem Scaffold proprio)"
```

---

### Task 7: Home — remover top bar + nav grid

**Files:**
- Modify: `app/lib/features/home/home_screen.dart`
- Delete: `app/lib/features/home/widgets/home_top_bar.dart`, `app/lib/features/home/widgets/nav_grid.dart`
- Modify: `app/test/features/home/home_screen_test.dart`
- Delete: `app/test/features/home/nav_grid_test.dart`

**Interfaces:**
- Consumes: `NextRaidHero`, `StatTiles`, `meProvider`, `myRaidsProvider`, `charactersProvider`.

- [ ] **Step 1: `home_screen.dart`** — remover imports/uso de `HomeTopBar` e `NavGrid` e o label de navegação. O `Column` da Home fica:
```dart
                return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  stg(const _Eyebrow()),
                  const SizedBox(height: 14),
                  stg(raids.isLoading ? const HeroSkeleton() : NextRaidHero(raid: next, compact: compact)),
                  SizedBox(height: compact ? 20 : 26),
                  stg(StatTiles(
                    raids: activeRaidsCount(raidList),
                    chars: chars.valueOrNull?.length ?? 0,
                    confirmed: confirmedCount(raidList),
                    compact: compact,
                  )),
                  const SizedBox(height: 30),
                ]);
```
Remover os imports `widgets/home_top_bar.dart`, `widgets/nav_grid.dart`, e o uso de `authStateProvider` se não for mais usado (o logout agora está no `HoloUserMenu`). Remover o `_NavLabel`. O `HomeSkeleton` continua (mas sem a linha do topbar/nav — ajustar `home_skeleton.dart` para não desenhar o topbar; opcional, pode manter). Deixar `ref` só p/ os providers.

- [ ] **Step 2: Deletar** os widgets órfãos:
```bash
git rm app/lib/features/home/widgets/home_top_bar.dart app/lib/features/home/widgets/nav_grid.dart app/test/features/home/nav_grid_test.dart
```

- [ ] **Step 3: Ajustar `home_screen_test.dart`** — remover asserts de wordmark e nav tiles; manter o resto:
```dart
  // no teste "com raid":
  //   REMOVER: expect(find.text('HoloRaid'), findsOneWidget);
  //   REMOVER: expect(find.text('Raids'), findsOneWidget);
  //   REMOVER: expect(find.text('Admin'), findsNothing);
  //   MANTER : expect(find.text('The Dread Fortress'), findsOneWidget);
```
Ou seja, o teste "com raid" fica:
```dart
  testWidgets('Home com raid renderiza a próxima operation e os tiles', (tester) async {
    await tester.pumpWidget(_app(_overrides(withRaid: true)));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('The Dread Fortress'), findsOneWidget);
    expect(find.text('RAIDS ATIVAS'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
```
Os testes "sem raid" (empty-state) e "viewport estreito" permanecem.

- [ ] **Step 4: Rodar** `flutter analyze` (limpo) e `flutter test` (verde).

- [ ] **Step 5: Commit**
```bash
git add app/lib/features/home/home_screen.dart app/lib/features/home/widgets/home_skeleton.dart app/test/features/home/home_screen_test.dart
git commit -m "refactor(app): Home sem top bar/nav grid (navegacao migrou pro shell)"
```

---

### Task 8: Verificação visual real (desktop + celular)

- [ ] **Step 1: Build web** (PowerShell): `flutter build web --dart-define=API_BASE_URL=http://localhost:3010`.
- [ ] **Step 2:** Servir e logar; conferir: sidebar no desktop (destinos, ativo destacado, wordmark), navegar entre seções sem recarregar o shell, FAB aparecendo em Personagens/Raids; menu do usuário (Perfil/Sair/toggle); no **celular** (DevTools ≤430px) o hambúrguer abre o Drawer, e a AppBar mostra o menu do usuário. Sem duplo AppBar, sem overflow.
- [ ] **Step 3:** Ajustes finos se necessário (sem novos recursos). Commit se houver.

---

## Self-Review

- **Cobertura do spec:** shell responsivo (T5+T6), sidebar/drawer (T4), user menu com Perfil/reduzir-animações/admin/sair (T3), destinos + gating + fab + título (T1), telas body-only (T6), Home limpa (T7), testes (T1/T3/T5/T7), verificação (T8). ✔
- **Placeholders:** nenhum; código real em cada step. ✔
- **Consistência de tipos:** `NavDestination`/`navDestinations`/`isDestinationActive`/`fabForLocation`/`titleForLocation`/`NavFab` (T1) usados igual em T4/T5; `NavTile` (T2) em T4; `HoloUserMenu`/`HoloSidebar`/`HoloDrawer` (T3/T4) em T5. ✔
- **Riscos:** `redirect` de auth intacto (ShellRoute não interfere); `GoRouterState.of(context)` exige contexto sob o `Router` — garantido pois AppShell é construído pelo ShellRoute. Menu do usuário lê `meProvider` (já usado na Home).
