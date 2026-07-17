import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:holoraid/core/reference/reference_providers.dart';
import 'package:holoraid/features/raids/raid_form_screen.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import 'package:holoraid/features/raids/raids_providers.dart';
import 'fake_raids_repository.dart';

Future<FakeRaidsRepository> pumpRaidForm(
  WidgetTester tester, {
  int? editRaidId,
  Raid? existing,
  List<String> operations = const ['Dread Palace', 'Dread Fortress'],
}) async {
  // O form é um ListView (lazy): num viewport pequeno os widgets do fim (botão) não
  // são construídos. Um viewport alto garante que a tela inteira exista na árvore.
  tester.view.physicalSize = const Size(1200, 2400);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final fake = FakeRaidsRepository()..getResult = existing;
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, _) => const Scaffold(body: SizedBox())),
      GoRoute(path: '/form', builder: (_, _) => RaidFormScreen(editRaidId: editRaidId)),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        raidsRepositoryProvider.overrideWithValue(fake),
        operationsProvider.overrideWith((ref) async => operations),
      ],
      child: MaterialApp.router(routerConfig: router),
    ),
  );
  router.push('/form');
  await tester.pumpAndSettle();
  return fake;
}
