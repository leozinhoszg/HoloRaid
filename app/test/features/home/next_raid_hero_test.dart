import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/features/home/my_raid_model.dart';
import 'package:holoraid/features/home/widgets/next_raid_hero.dart';
import '../../support/localized_tester.dart';

Widget _wrap(Widget c) => MaterialApp.router(
    routerConfig: GoRouter(
        routes: [GoRoute(path: '/', builder: (_, _) => Scaffold(body: SingleChildScrollView(child: c)))]));

void main() {
  setUpAll(initTestLocalization);

  testWidgets('com raid mostra operation', (tester) async {
    final r = MyRaid.fromJson({
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
    });
    await tester.pumpWidget(_wrap(NextRaidHero(raid: r, compact: true)));
    expect(find.text('The Dread Fortress'), findsOneWidget);
    await tester.pumpWidget(const SizedBox()); // desmonta -> cancela timers
  });

  testWidgets('sem raid mostra empty-state', (tester) async {
    await tester.pumpWidget(_wrap(const NextRaidHero(raid: null, compact: true)));
    expect(find.textContaining('No operation'), findsOneWidget);
  });
}
