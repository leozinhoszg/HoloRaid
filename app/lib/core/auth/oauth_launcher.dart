import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import '../network/api_client.dart';
import '../config/app_config.dart';

class OAuthResult {
  final String accessToken;
  final Map<String, dynamic> user;
  OAuthResult(this.accessToken, this.user);
}

/// Executa o fluxo OAuth completo e devolve o access token + user.
Future<OAuthResult> runDiscordOAuth(ApiClient api) async {
  final urlRes = await api.dio.get('/auth/discord/url');
  final authUrl = urlRes.data['url'] as String;
  final codeVerifier = urlRes.data['codeVerifier'] as String;

  final result = await FlutterWebAuth2.authenticate(
    url: authUrl,
    callbackUrlScheme: AppConfig.oauthCallbackScheme,
  );
  final code = Uri.parse(result).queryParameters['code'];
  if (code == null) throw Exception('Discord did not return a code');

  final cbRes = await api.dio.post('/auth/callback',
      data: {'code': code, 'codeVerifier': codeVerifier});
  return OAuthResult(
    cbRes.data['accessToken'] as String,
    (cbRes.data['user'] as Map).cast<String, dynamic>(),
  );
}
