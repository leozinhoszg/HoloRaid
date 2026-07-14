class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
  static const discordClientId = String.fromEnvironment('DISCORD_CLIENT_ID');
  // Callback: Web usa a URL do SPA; mobile/desktop usam o scheme abaixo.
  static const oauthCallbackScheme = 'raidsync';
}
