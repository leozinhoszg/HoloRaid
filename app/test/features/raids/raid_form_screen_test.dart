import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/ui/holo_dropdown.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import '../../support/pump_raid_form.dart';

Raid _raid({String notes = 'lockme', int size = 16, int minTier = 3}) => Raid(
      id: 7, codigo: 'AB12', operation: 'Dread Fortress', difficulty: 'NiM', size: size,
      faction: 'Empire', minimumTier: minTier, checkComposition: false,
      slotsTank: 2, slotsHeal: 4, slotsDps: 10, notes: notes,
      startAt: DateTime.utc(2026, 8, 1, 20, 30), status: 'OPEN', createdBy: 1,
    );

// Em criação, _operation começa null (botão desabilitado); o usuário escolhe no dropdown.
Future<void> _pickOperation(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('f_operation')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Dread Palace').last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('criar: renderiza titulo, switch e botao', (tester) async {
    await pumpRaidForm(tester);
    expect(find.text('Criar raid'), findsWidgets); // AppBar + botão
    expect(find.widgetWithText(SwitchListTile, 'Disable mentions'), findsOneWidget);
  });

  testWidgets('criar: guarda de slots desabilita o botao quando soma != size', (tester) async {
    await pumpRaidForm(tester);
    await _pickOperation(tester);
    var btn = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Criar raid'));
    expect(btn.onPressed, isNotNull); // operation escolhida + 2/2/4=8 -> habilitado
    await tester.ensureVisible(find.byIcon(Icons.add).first);
    await tester.tap(find.byIcon(Icons.add).first);
    await tester.pump();
    btn = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Criar raid'));
    expect(btn.onPressed, isNull); // soma 9 != 8 -> desabilitado
  });

  testWidgets('criar: salvar chama create no repo', (tester) async {
    final fake = await pumpRaidForm(tester);
    await _pickOperation(tester);
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Criar raid'));
    await tester.tap(find.widgetWithText(FilledButton, 'Criar raid'));
    await tester.pumpAndSettle();
    expect(fake.createCalls, hasLength(1));
    expect(fake.createCalls.first['operation'], 'Dread Palace');
    expect(fake.createCalls.first['slots_tank'], 2);
  });

  testWidgets('editar: preenche, esconde switch e trava os imutaveis', (tester) async {
    await pumpRaidForm(tester, editRaidId: 7, existing: _raid());
    expect(find.text('Editar raid'), findsOneWidget); // AppBar
    expect(find.widgetWithText(FilledButton, 'Salvar'), findsOneWidget);
    expect(find.text('lockme'), findsOneWidget); // notes prefilled
    expect(find.widgetWithText(SwitchListTile, 'Disable mentions'), findsNothing);
    final op = tester.widget<HoloDropdown<String>>(find.byKey(const ValueKey('f_operation')));
    expect(op.onChanged, isNull); // imutável travado
  });

  testWidgets('editar: salvar chama update com id e payload', (tester) async {
    final fake = await pumpRaidForm(tester, editRaidId: 7, existing: _raid());
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Salvar'));
    await tester.tap(find.widgetWithText(FilledButton, 'Salvar'));
    await tester.pumpAndSettle();
    expect(fake.updateCalls, hasLength(1));
    expect(fake.updateCalls.first.id, 7);
    final body = fake.updateCalls.first.body;
    expect(body.containsKey('minimum_tier'), isTrue);
    expect(body.containsKey('slots_tank'), isTrue);
    expect(body.containsKey('start_at'), isTrue);
    expect(body.containsKey('operation'), isFalse); // imutável não vai no payload
  });
}
