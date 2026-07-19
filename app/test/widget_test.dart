import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:holoraid/core/auth/auth_providers.dart';
import 'package:holoraid/main.dart';
import 'support/fake_auth_notifier.dart';

void main() {
  testWidgets('HoloRaidApp monta sem erros', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      // Sem isto o restore() no boot dispara um GET /me real (timer pendente).
      overrides: [
        authStateProvider.overrideWith((ref) => FakeAuthNotifier(ref, const AuthSignedOut())),
      ],
      child: const HoloRaidApp(),
    ));
    expect(find.byType(MaterialApp), findsOneWidget);
    // a LoginScreen (rota inicial) usa flutter_animate — drena os timers de entrada.
    await tester.pump(const Duration(seconds: 2));
  });
}
