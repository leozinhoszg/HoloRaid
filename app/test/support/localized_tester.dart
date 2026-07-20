import 'dart:convert';
import 'dart:io';

import 'package:easy_localization/easy_localization.dart';
// ignore: implementation_imports
import 'package:easy_localization/src/localization.dart';
// ignore: implementation_imports
import 'package:easy_localization/src/translations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const List<Locale> kTestLocales = [
  Locale('en'), Locale('pt'), Locale('de'), Locale('fr'), Locale('es'),
];

/// Inicializa a localização para testes carregando as traduções `en` no
/// singleton global [Localization]. Assim `'chave'.tr()` (que usa
/// `Localization.instance` quando sem context) resolve para inglês em qualquer
/// teste, sem exigir o widget EasyLocalization na árvore.
/// Chame no `setUpAll` de qualquer widget test que renderize telas com `.tr()`.
Future<void> initTestLocalization() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});
  final enMap = json.decode(
    File('assets/translations/en.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  Localization.load(
    const Locale('en'),
    translations: Translations(enMap),
    fallbackTranslations: Translations(enMap),
  );
  await EasyLocalization.ensureInitialized();
}

/// Envolve [child] com EasyLocalization para widget tests que dependem do
/// widget (ex.: telas que usam `context.locale`/`context.setLocale`).
/// Requer [initTestLocalization] no setUpAll.
Future<void> pumpLocalized(
  WidgetTester tester,
  Widget child, {
  Locale locale = const Locale('en'),
}) async {
  await tester.pumpWidget(
    EasyLocalization(
      supportedLocales: kTestLocales,
      path: 'assets/translations',
      fallbackLocale: const Locale('en'),
      useOnlyLangCode: true,
      startLocale: locale,
      child: Builder(
        builder: (context) => MaterialApp(
          locale: context.locale,
          supportedLocales: context.supportedLocales,
          localizationsDelegates: context.localizationDelegates,
          home: child,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Envolve uma árvore com o widget EasyLocalization real. Use apenas quando o
/// widget sob teste depende de `context.locale` (ex.: HoloRaidApp). Para telas
/// que só usam `'chave'.tr()`, um MaterialApp comum basta (o singleton já foi
/// carregado por [initTestLocalization]). Requer [initTestLocalization].
Widget wrapEasyLoc(Widget Function(BuildContext ctx) builder) {
  return EasyLocalization(
    supportedLocales: kTestLocales,
    path: 'assets/translations',
    fallbackLocale: const Locale('en'),
    useOnlyLangCode: true,
    child: Builder(builder: builder),
  );
}
