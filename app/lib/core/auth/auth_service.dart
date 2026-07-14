import '../network/api_client.dart';
import '../auth/token_storage.dart';
import 'oauth_launcher.dart';

class AuthService {
  final ApiClient api;
  final TokenStorage storage;
  AuthService(this.api, this.storage);

  Future<Map<String, dynamic>> login() async {
    final res = await runDiscordOAuth(api);
    storage.accessToken = res.accessToken;
    // Web recebe refresh via cookie; mobile/desktop via body seria adicionado aqui.
    return res.user;
  }

  Future<Map<String, dynamic>> loadMe() async {
    final res = await api.dio.get('/me');
    return (res.data as Map).cast<String, dynamic>();
  }

  Future<void> logout() async {
    try {
      await api.dio.post('/auth/logout');
    } catch (_) {}
    await storage.clear();
  }
}
