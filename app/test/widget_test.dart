import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:holoraid/main.dart';

void main() {
  testWidgets('HoloRaidApp monta sem erros', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: HoloRaidApp()));
    expect(find.byType(MaterialApp), findsOneWidget);
    // a LoginScreen (rota inicial) usa flutter_animate — drena os timers de entrada.
    await tester.pump(const Duration(seconds: 2));
  });
}
