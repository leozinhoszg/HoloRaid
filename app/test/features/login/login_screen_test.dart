import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/features/login/login_screen.dart';

void main() {
  testWidgets('landing renderiza wordmark, tagline, CTA e destaques em ingles', (tester) async {
    tester.view.physicalSize = const Size(1200, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, _) => const LoginScreen()),
    ]);
    await tester.pumpWidget(ProviderScope(child: MaterialApp.router(routerConfig: router)));
    // avança o relógio: dispara os delays e completa as entradas do flutter_animate
    // (finitas) num passo determinístico, sem deixar timers pendentes.
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));

    expect(find.text('HoloRaid'), findsOneWidget);
    expect(find.text('Command your SWTOR Operations.'), findsOneWidget);
    expect(find.text('Continue with Discord'), findsOneWidget);
    expect(find.text('Organize raids'), findsOneWidget);
    expect(find.text('Sync with Discord'), findsOneWidget);
    expect(find.text('Track PvE progression'), findsOneWidget);
    expect(find.text('Terms'), findsOneWidget);
    expect(find.text('Privacy'), findsOneWidget);
  });
}
