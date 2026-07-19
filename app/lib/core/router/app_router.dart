import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_providers.dart';
import '../nav/app_shell.dart';
import '../../features/login/login_screen.dart';
import '../../features/splash/splash_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/characters/characters_list_screen.dart';
import '../../features/characters/character_form_screen.dart';
import '../../features/characters/character_profile_screen.dart';
import '../../features/profile/me_progression_screen.dart';
import '../../features/raids/raids_list_screen.dart';
import '../../features/raids/raid_form_screen.dart';
import '../../features/raids/raid_detail_screen.dart';
import '../../features/dashboard/dashboard_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/admin/users_admin_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  // Sem isto o go_router não reavalia o redirect quando o login muda o estado
  // de AuthSignedOut→AuthSignedIn, e o app fica preso no /login.
  final refresh = ValueNotifier<AuthState>(ref.read(authStateProvider));
  ref.onDispose(refresh.dispose);
  ref.listen<AuthState>(authStateProvider, (_, next) => refresh.value = next);

  return GoRouter(
    initialLocation: '/home',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);
      final loc = state.matchedLocation;
      // Restaurando a sessão no boot: mostra o splash (não joga pro login ainda).
      if (auth is AuthUnknown) return loc == '/splash' ? null : '/splash';
      final signedIn = auth is AuthSignedIn;
      if (!signedIn) return loc == '/login' ? null : '/login';
      // Logado: tira do splash/login.
      if (loc == '/login' || loc == '/splash') return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      // Destinos principais dentro do app shell (sidebar/drawer + user menu).
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
          GoRoute(path: '/characters', builder: (_, _) => const CharactersListScreen()),
          GoRoute(path: '/progression', builder: (_, _) => const MeProgressionScreen()),
          GoRoute(path: '/raids', builder: (_, _) => const RaidsListScreen()),
          GoRoute(path: '/dashboard', builder: (_, _) => const DashboardScreen()),
          GoRoute(path: '/admin/users', builder: (_, _) => const UsersAdminScreen()),
        ],
      ),
      // Telas empilhadas em tela cheia (fora do shell, com botão voltar próprio).
      GoRoute(path: '/characters/new', builder: (_, _) => const CharacterFormScreen()),
      GoRoute(
        path: '/characters/:id',
        builder: (_, state) => CharacterProfileScreen(id: int.parse(state.pathParameters['id']!)),
      ),
      GoRoute(path: '/raids/new', builder: (_, _) => const RaidFormScreen()),
      GoRoute(path: '/raids/:id/edit', builder: (_, state) => RaidFormScreen(editRaidId: int.parse(state.pathParameters['id']!))),
      GoRoute(path: '/raids/:id', builder: (_, state) => RaidDetailScreen(id: int.parse(state.pathParameters['id']!))),
      GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen()),
    ],
  );
});
