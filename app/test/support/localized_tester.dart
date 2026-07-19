import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const List<Locale> kTestLocales = [
  Locale('en'), Locale('pt'), Locale('de'), Locale('fr'), Locale('es'),
];

/// Inicializa o EasyLocalization em ambiente de teste, mockando o
/// shared_preferences que ele usa para persistir o locale.
/// Chame no `setUpAll` de qualquer widget test que use [pumpLocalized].
Future<void> initTestLocalization() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});
  await EasyLocalization.ensureInitialized();
}

/// Envolve [child] com EasyLocalization para widget tests.
/// Chame `await EasyLocalization.ensureInitialized()` no setUpAll do teste.
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
