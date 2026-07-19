import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/ui/holo_background.dart';

void main() {
  testWidgets('HoloBackground pinta o filho', (tester) async {
    await tester.pumpWidget(const ProviderScope(
        child: MaterialApp(
            home: HoloBackground(
                child: Text('x', textDirection: TextDirection.ltr)))));
    expect(find.text('x'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
  });
}
