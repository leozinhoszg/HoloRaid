import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import '../../support/localized_tester.dart';
import '../../support/pump_raid_detail.dart';

Raid _raid({String status = 'OPEN'}) => Raid(
      id: 5, codigo: 'AB12', operation: 'Dread Palace', difficulty: 'HM', size: 8,
      faction: 'Republic', minimumTier: 0, checkComposition: false,
      slotsTank: 2, slotsHeal: 2, slotsDps: 4, notes: null,
      startAt: DateTime.utc(2026, 8, 1, 20, 30), status: status, createdBy: 100,
    );

void main() {
  setUpAll(initTestLocalization);

  testWidgets('comum: nao ve botoes de gestao', (tester) async {
    await pumpRaidDetail(tester, raid: _raid(), authUserId: 999, authRole: 'user');
    expect(find.text('Edit'), findsNothing);
    expect(find.text('Start'), findsNothing);
    expect(find.text('Duplicate'), findsNothing);
    expect(find.text('Delete'), findsNothing);
    expect(find.text('Share'), findsOneWidget); // não é gestão
  });

  testWidgets('lider (OPEN): ve todos os botoes de gestao', (tester) async {
    await pumpRaidDetail(tester, raid: _raid(), authUserId: 100, authRole: 'user');
    expect(find.text('Edit'), findsOneWidget);
    expect(find.text('Start'), findsOneWidget);
    expect(find.text('Finish'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.text('Duplicate'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });

  testWidgets('admin nao-lider (OPEN): ve gestao por override', (tester) async {
    await pumpRaidDetail(tester, raid: _raid(), authUserId: 999, authRole: 'admin');
    expect(find.text('Edit'), findsOneWidget);
    expect(find.text('Duplicate'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });

  testWidgets('lider (RUNNING): esconde Editar/Iniciar, mantem o resto', (tester) async {
    await pumpRaidDetail(tester, raid: _raid(status: 'RUNNING'), authUserId: 100, authRole: 'user');
    expect(find.text('Edit'), findsNothing);   // só OPEN
    expect(find.text('Start'), findsNothing);  // só OPEN
    expect(find.text('Finish'), findsOneWidget);
    expect(find.text('Cancel'), findsOneWidget);
    expect(find.text('Duplicate'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });
}
