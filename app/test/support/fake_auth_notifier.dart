import 'package:holoraid/core/auth/auth_providers.dart';

class FakeAuthNotifier extends AuthNotifier {
  FakeAuthNotifier(super.ref, AuthState initial) {
    state = initial;
  }
}
