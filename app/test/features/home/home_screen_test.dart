import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/features/characters/character_model.dart';
import 'package:holoraid/features/characters/characters_providers.dart';
import 'package:holoraid/features/home/home_providers.dart';
import 'package:holoraid/features/home/home_screen.dart';
import 'package:holoraid/features/home/my_raid_model.dart';
import '../../support/localized_tester.dart';

Widget _app(List<Override> o) => ProviderScope(
    overrides: o,
    child: MaterialApp.router(
        routerConfig: GoRouter(routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())])));

List<Override> _overrides({required bool withRaid}) => [
      meProvider.overrideWith((ref) async =>
          {'username': '.the.mentor', 'role': 'user', 'discord_id': '1', 'avatar': null}),
      charactersProvider.overrideWith((ref) async => <Character>[]),
      myRaidsProvider.overrideWith((ref) async => withRaid
          ? [
              MyRaid.fromJson({
                'id': 1,
                'codigo': 'DF1',
                'operation': 'The Dread Fortress',
                'difficulty': 'veteran',
                'size': 8,
                'faction': 'empire',
                'start_at': DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
                'status': 'OPEN',
                'created': 0,
                'my_status': 'confirmed',
              })
            ]
          : <MyRaid>[]),
    ];

void main() {
  setUpAll(initTestLocalization);

  testWidgets('Home com raid renderiza a próxima operation e os tiles', (tester) async {
    await tester.pumpWidget(_app(_overrides(withRaid: true)));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('The Dread Fortress'), findsOneWidget);
    expect(find.text('ACTIVE RAIDS'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Home sem raid mostra empty-state', (tester) async {
    await tester.pumpWidget(_app(_overrides(withRaid: false)));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(find.textContaining('No operation'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Home em viewport estreito não estoura (sem RenderFlex overflow)', (tester) async {
    tester.view.physicalSize = const Size(390, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final errors = <FlutterErrorDetails>[];
    final prev = FlutterError.onError;
    FlutterError.onError = errors.add;
    await tester.pumpWidget(_app(_overrides(withRaid: true)));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    FlutterError.onError = prev;
    expect(errors.where((e) => e.exceptionAsString().contains('overflow')), isEmpty);
    await tester.pumpWidget(const SizedBox());
  });
}
