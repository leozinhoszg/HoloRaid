import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/core/nav/holo_user_menu.dart';
import 'package:holoraid/core/settings/settings_providers.dart';
import 'package:holoraid/features/home/home_providers.dart';
import '../../support/localized_tester.dart';

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
  setUpAll(initTestLocalization);

  testWidgets('abre e mostra Perfil e Sair; Admin oculto p/ user', (tester) async {
    await tester.pumpWidget(_app(_ov(role: 'user')));
    await tester.pump();
    await tester.tap(find.byType(HoloUserMenu));
    await tester.pumpAndSettle();
    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('Logout'), findsOneWidget);
    expect(find.text('Admin'), findsNothing);
  });

  testWidgets('toggle Reduzir animações altera o provider', (tester) async {
    final container = ProviderContainer(overrides: _ov(role: 'user'));
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
          routerConfig: GoRouter(routes: [
            GoRoute(path: '/', builder: (_, _) => const Scaffold(body: HoloUserMenu())),
          ])),
    ));
    await tester.pump();
    await tester.tap(find.byType(HoloUserMenu));
    await tester.pumpAndSettle();
    expect(container.read(reduceMotionProvider), isFalse);
    await tester.tap(find.text('Reduce animations'));
    await tester.pump();
    expect(container.read(reduceMotionProvider), isTrue);
  });
}
