import 'package:holoraid/core/auth/auth_providers.dart';

class FakeAuthNotifier extends AuthNotifier {
  FakeAuthNotifier(super.ref, AuthState initial) {
    state = initial;
  }

  // Não restaura sessão do backend nos testes — usa o estado injetado.
  @override
  Future<void> restore() async {}
}
