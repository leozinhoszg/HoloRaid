import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';
import '../auth/token_storage.dart';
import 'auth_service.dart';

sealed class AuthState {
  const AuthState();
}

class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthSignedOut extends AuthState {
  const AuthSignedOut();
}

class AuthSignedIn extends AuthState {
  final Map<String, dynamic> user;
  const AuthSignedIn(this.user);
}

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage.platform());

final apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.watch(tokenStorageProvider);
  return ApiClient(storage, onSessionExpired: () async {
    ref.read(authStateProvider.notifier).forceSignedOut();
  });
});

final authServiceProvider = Provider<AuthService>((ref) =>
    AuthService(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider)));

final authStateProvider =
    StateNotifierProvider<AuthNotifier, AuthState>((ref) => AuthNotifier(ref));

class AuthNotifier extends StateNotifier<AuthState> {
  final Ref ref;
  AuthNotifier(this.ref) : super(const AuthUnknown());

  Future<void> login() async {
    final user = await ref.read(authServiceProvider).login();
    state = AuthSignedIn(user);
  }

  Future<void> logout() async {
    await ref.read(authServiceProvider).logout();
    state = const AuthSignedOut();
  }

  void forceSignedOut() => state = const AuthSignedOut();
}
