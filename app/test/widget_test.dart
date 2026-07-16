import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:holoraid/main.dart';

void main() {
  testWidgets('HoloRaidApp monta sem erros', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: HoloRaidApp()));
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
