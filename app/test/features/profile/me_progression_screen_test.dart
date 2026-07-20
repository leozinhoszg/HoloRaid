import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/localized_tester.dart';
import '../../support/pump_progression.dart';

// Catálogo representativo: operação com Vet+Master, boss secreto só-Master,
// lairs (um com ambos, outro só Vet) e um timer.
final _catalog = <Map<String, dynamic>>[
  {'id': 1, 'operation': 'Explosive Conflict', 'boss': 'Zorn & Toth', 'difficulty': 'Veteran', 'type': 'boss', 'points': 1},
  {'id': 2, 'operation': 'Explosive Conflict', 'boss': 'Zorn & Toth', 'difficulty': 'Master', 'type': 'boss', 'points': 1},
  {'id': 3, 'operation': 'Scum and Villainy', 'boss': 'Styrak', 'difficulty': 'Veteran', 'type': 'boss', 'points': 1},
  {'id': 4, 'operation': 'Scum and Villainy', 'boss': 'Styrak', 'difficulty': 'Master', 'type': 'boss', 'points': 1},
  {'id': 5, 'operation': 'Scum and Villainy', 'boss': 'Hateful Entity', 'difficulty': 'Master', 'type': 'boss', 'points': 1},
  {'id': 6, 'operation': 'XR-53', 'boss': 'XR-53', 'difficulty': 'Veteran', 'type': 'lair', 'points': 1},
  {'id': 7, 'operation': 'XR-53', 'boss': 'XR-53', 'difficulty': 'Master', 'type': 'lair', 'points': 1},
  {'id': 8, 'operation': 'Xeno', 'boss': 'Xeno', 'difficulty': 'Veteran', 'type': 'lair', 'points': 1},
  {'id': 9, 'operation': 'Explosive Conflict', 'boss': 'Timer', 'difficulty': null, 'type': 'timer', 'points': 1},
];

void main() {
  setUpAll(initTestLocalization);

  testWidgets('mostra seções: operações + Lair Bosses + Timers', (tester) async {
    await pumpProgression(tester, catalog: _catalog, mine: [{'boss_id': 1}]);

    // Títulos de seção (ExpansionTile colapsado, mas o título fica visível).
    expect(find.text('Explosive Conflict'), findsOneWidget);
    expect(find.text('Scum and Villainy'), findsOneWidget);
    expect(find.text('Lair Bosses'), findsOneWidget);
    expect(find.text('Timers'), findsOneWidget);
  });

  testWidgets('boss em linha única com colunas Veteran/Master; estado inicial vem do /me', (tester) async {
    await pumpProgression(tester, catalog: _catalog, mine: [{'boss_id': 1}]);

    await tester.tap(find.text('Explosive Conflict'));
    await tester.pumpAndSettle();

    // Uma linha (Timer saiu p/ seção própria) com exatamente 2 checkboxes.
    expect(find.text('Zorn & Toth'), findsOneWidget);
    expect(find.text('Veteran'), findsOneWidget);
    expect(find.text('Master'), findsOneWidget);
    final boxes = tester.widgetList<Checkbox>(find.byType(Checkbox)).toList();
    expect(boxes, hasLength(2));
    expect(boxes[0].value, isTrue); // Veteran (id 1) marcado pelo /me
    expect(boxes[1].value, isFalse); // Master (id 2) desmarcado
  });

  testWidgets('boss secreto só-Master mostra apenas 1 coluna', (tester) async {
    await pumpProgression(tester, catalog: _catalog, mine: const []);

    await tester.tap(find.text('Scum and Villainy'));
    await tester.pumpAndSettle();

    expect(find.text('Hateful Entity'), findsOneWidget);
    // Styrak (Vet+Master) = 2 checkboxes; Hateful (só Master) = 1 → total 3.
    expect(find.byType(Checkbox), findsNWidgets(3));
  });

  testWidgets('marcar Master e salvar envia os ids ao PUT /me/bosses', (tester) async {
    final adapter = await pumpProgression(tester, catalog: _catalog, mine: [{'boss_id': 1}]);

    await tester.tap(find.text('Explosive Conflict'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Master')); // marca id 2
    await tester.pumpAndSettle();

    await tester.tap(find.text('Save progression'));
    await tester.pumpAndSettle();

    expect(adapter.puts, hasLength(1));
    final ids = ((adapter.puts.single.data as Map)['bossIds'] as List).cast<int>();
    expect(ids, containsAll(<int>[1, 2]));
  });
}
