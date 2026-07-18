import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/core/auth/auth_providers.dart';
import 'package:holoraid/core/realtime/socket_service.dart';
import 'package:holoraid/features/raids/raid_detail_screen.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import 'package:holoraid/features/raids/raids_providers.dart';
import 'fake_auth_notifier.dart';
import 'fake_raids_repository.dart';
import 'fake_socket_service.dart';

Future<void> pumpRaidDetail(
  WidgetTester tester, {
  required Raid raid,
  required int authUserId,
  required String authRole,
}) async {
  tester.view.physicalSize = const Size(1200, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final fake = FakeRaidsRepository()..getResult = raid;
  final router = GoRouter(
    initialLocation: '/detail',
    routes: [
      GoRoute(path: '/detail', builder: (_, _) => RaidDetailScreen(id: raid.id)),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        raidsRepositoryProvider.overrideWithValue(fake),
        socketServiceProvider.overrideWithValue(FakeSocketService()),
        authStateProvider.overrideWith(
          (ref) => FakeAuthNotifier(ref, AuthSignedIn({'id': authUserId, 'role': authRole})),
        ),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  await tester.pumpAndSettle();
}
