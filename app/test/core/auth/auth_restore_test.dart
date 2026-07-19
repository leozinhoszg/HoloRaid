import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/auth/auth_providers.dart';
import 'package:holoraid/core/auth/auth_service.dart';
import 'package:holoraid/core/auth/token_storage.dart';
import 'package:holoraid/core/network/api_client.dart';

class _StubAuth extends AuthService {
  final bool ok;
  final Map<String, dynamic> user;
  _StubAuth(this.ok, this.user)
      : super(ApiClient(MemoryTokenStorage(), onSessionExpired: () async {}), MemoryTokenStorage());

  @override
  Future<Map<String, dynamic>> loadMe() async {
    if (!ok) throw Exception('401');
    return user;
  }
}

void main() {
  test('restore com sessão válida → AuthSignedIn', () async {
    final c = ProviderContainer(overrides: [
      authServiceProvider.overrideWithValue(_StubAuth(true, {'username': 'ana'})),
    ]);
    addTearDown(c.dispose);
    expect(c.read(authStateProvider), isA<AuthUnknown>()); // estado inicial no boot
    await Future<void>.delayed(Duration.zero); // deixa o restore() completar
    final st = c.read(authStateProvider);
    expect(st, isA<AuthSignedIn>());
    expect((st as AuthSignedIn).user['username'], 'ana');
  });

  test('restore sem sessão → AuthSignedOut', () async {
    final c = ProviderContainer(overrides: [
      authServiceProvider.overrideWithValue(_StubAuth(false, const {})),
    ]);
    addTearDown(c.dispose);
    c.read(authStateProvider); // constrói o notifier (dispara restore)
    await Future<void>.delayed(Duration.zero);
    expect(c.read(authStateProvider), isA<AuthSignedOut>());
  });
}
