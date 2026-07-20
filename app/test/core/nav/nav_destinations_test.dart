import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/nav/nav_destinations.dart';
import '../../support/localized_tester.dart';

void main() {
  setUpAll(initTestLocalization);

  test('admin oculto para user, visível para admin', () {
    expect(navDestinations(isAdmin: false).any((d) => d.route == '/admin/users'), isFalse);
    expect(navDestinations(isAdmin: true).any((d) => d.route == '/admin/users'), isTrue);
  });
  test('destino ativo por prefixo, exceto home exato', () {
    expect(isDestinationActive('/raids', '/raids'), isTrue);
    expect(isDestinationActive('/raids', '/raids/5'), isTrue);
    expect(isDestinationActive('/home', '/home'), isTrue);
    expect(isDestinationActive('/home', '/raids'), isFalse);
    expect(isDestinationActive('/characters', '/raids'), isFalse);
  });
  test('fab só em characters e raids', () {
    expect(fabForLocation('/characters')!.route, '/characters/new');
    expect(fabForLocation('/raids')!.route, '/raids/new');
    expect(fabForLocation('/dashboard'), isNull);
    expect(fabForLocation('/home'), isNull);
  });
  test('titulo por localização', () {
    // As traduções (en) já foram carregadas no singleton por initTestLocalization.
    expect(titleForLocation('/characters'), 'Characters');
    expect(titleForLocation('/raids/5'), 'Raids');
    expect(titleForLocation('/desconhecido'), 'HoloRaid');
  });
}
