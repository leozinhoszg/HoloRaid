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
