import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_providers.dart';
import '../../features/login/login_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/characters/characters_list_screen.dart';
import '../../features/characters/character_form_screen.dart';
import '../../features/characters/character_profile_screen.dart';
import '../../features/characters/character_progression_screen.dart';
import '../../features/raids/raids_list_screen.dart';
import '../../features/raids/raid_form_screen.dart';
import '../../features/raids/raid_detail_screen.dart';
import '../../features/dashboard/dashboard_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/home',
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);
      final signedIn = auth is AuthSignedIn;
      final onLogin = state.matchedLocation == '/login';
      if (!signedIn && !onLogin) return '/login';
      if (signedIn && onLogin) return '/home';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
      GoRoute(path: '/characters', builder: (_, _) => const CharactersListScreen()),
      GoRoute(path: '/characters/new', builder: (_, _) => const CharacterFormScreen()),
      GoRoute(
        path: '/characters/:id',
        builder: (_, state) => CharacterProfileScreen(id: int.parse(state.pathParameters['id']!)),
      ),
      GoRoute(
        path: '/characters/:id/progression',
        builder: (_, state) => CharacterProgressionScreen(id: int.parse(state.pathParameters['id']!)),
      ),
      GoRoute(path: '/raids', builder: (_, _) => const RaidsListScreen()),
      GoRoute(path: '/raids/new', builder: (_, _) => const RaidFormScreen()),
      GoRoute(path: '/raids/:id', builder: (_, state) => RaidDetailScreen(id: int.parse(state.pathParameters['id']!))),
      GoRoute(path: '/dashboard', builder: (_, _) => const DashboardScreen()),
    ],
  );
});
