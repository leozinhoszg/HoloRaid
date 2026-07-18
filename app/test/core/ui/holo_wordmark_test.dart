import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/ui/holo_wordmark.dart';

void main() {
  testWidgets('HoloWordmark renderiza o texto HoloRaid', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: HoloWordmark(size: 34))));
    expect(find.text('HoloRaid'), findsOneWidget);
  });
}
