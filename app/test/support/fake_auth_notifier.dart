import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:holoraid/core/auth/auth_providers.dart';

class FakeAuthNotifier extends AuthNotifier {
  FakeAuthNotifier(Ref ref, AuthState initial) : super(ref) {
    state = initial;
  }
}
