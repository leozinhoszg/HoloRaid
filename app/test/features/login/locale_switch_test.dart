import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import '../../support/localized_tester.dart';

/// Reproduz a cadeia real: go_router + telas que usam `'chave'.tr()` (sem
/// context) sob o `builder` com KeyedSubtree por locale (como em main.dart).
/// Prova que trocar o locale atualiza o texto da rota atual NA HORA.
Widget _app() {
  final router = GoRouter(routes: [
    GoRoute(
      path: '/',
      builder: (context, _) => Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Texto traduzido via extensão de String (sem context) — o caso
              // que NÃO cria dependência do Localizations.
              Text('login.terms'.tr()),
              ElevatedButton(
                onPressed: () => context.setLocale(const Locale('pt')),
                child: const Text('to-pt'),
              ),
            ],
          ),
        ),
      ),
    ),
  ]);

  return EasyLocalization(
    supportedLocales: kTestLocales,
    path: 'assets/translations',
    fallbackLocale: const Locale('en'),
    useOnlyLangCode: true,
    startLocale: const Locale('en'),
    child: Builder(
      builder: (context) => MaterialApp.router(
        locale: context.locale,
        supportedLocales: context.supportedLocales,
        localizationsDelegates: context.localizationDelegates,
        routerConfig: router,
        // Mesma estratégia do main.dart: KeyedSubtree por locale força o
        // conteúdo roteado a reconstruir quando o idioma muda.
        builder: (context, child) => KeyedSubtree(
          key: ValueKey(context.locale.languageCode),
          child: child ?? const SizedBox.shrink(),
        ),
      ),
    ),
  );
}

void main() {
  setUpAll(initTestLocalization);

  testWidgets('trocar o locale atualiza o texto da rota na hora', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    // Estado inicial: inglês.
    expect(find.text('Terms'), findsOneWidget);
    expect(find.text('Termos'), findsNothing);

    // Troca para português (como o seletor faz via context.setLocale).
    await tester.tap(find.text('to-pt'));
    await tester.pumpAndSettle();

    // O texto da rota atual deve refletir o novo idioma imediatamente.
    expect(find.text('Termos'), findsOneWidget);
    expect(find.text('Terms'), findsNothing);
  });
}
