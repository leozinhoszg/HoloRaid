import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/core/nav/app_shell.dart';
import 'package:holoraid/features/home/home_providers.dart';

GoRouter _router() => GoRouter(initialLocation: '/home', routes: [
      ShellRoute(
        builder: (_, _, child) => AppShell(child: child),
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
