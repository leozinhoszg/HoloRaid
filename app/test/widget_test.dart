import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:holoraid/core/auth/auth_providers.dart';
import 'package:holoraid/core/settings/settings_providers.dart';
import 'package:holoraid/main.dart';
import 'support/fake_auth_notifier.dart';
import 'support/localized_tester.dart';

void main() {
  setUpAll(initTestLocalization);

  testWidgets('HoloRaidApp monta sem erros', (WidgetTester tester) async {
    await tester.pumpWidget(wrapEasyLoc((_) => ProviderScope(
      // Sem isto o restore() no boot dispara um GET /me real (timer pendente).
      overrides: [
        authStateProvider.overrideWith((ref) => FakeAuthNotifier(ref, const AuthSignedOut())),
        // Sem starfield contínuo: evita animação infinita que impede o settle.
        reduceMotionProvider.overrideWith((ref) => true),
      ],
      child: const HoloRaidApp(),
    )));
    expect(find.byType(MaterialApp), findsOneWidget);
    // EasyLocalization carrega async; depois a LoginScreen (rota inicial) usa
    // flutter_animate — drena o load e os timers de entrada (finitos).
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    // Desmonta explicitamente: dispõe a árvore de forma controlada antes da
    // finalização do teste (evita lookup de ancestral já desativado).
    await tester.pumpWidget(const SizedBox());
  });
}
