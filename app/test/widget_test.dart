import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:raidsync/main.dart';

void main() {
  testWidgets('RaidSyncApp monta sem erros', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: RaidSyncApp()));
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
