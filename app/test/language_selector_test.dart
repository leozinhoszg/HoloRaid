import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/settings/language_selector.dart';
import 'support/localized_tester.dart';

void main() {
  setUpAll(initTestLocalization);

  testWidgets('abre o menu e mostra os 5 idiomas nativos', (tester) async {
    await pumpLocalized(tester, const Scaffold(body: GlassLanguageSelector()));
    await tester.tap(find.byType(GlassLanguageSelector));
    await tester.pumpAndSettle();
    for (final name in ['English', 'Português', 'Deutsch', 'Français', 'Español']) {
      expect(find.text(name), findsWidgets);
    }
  });
}
