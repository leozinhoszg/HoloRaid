import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/ui/holo_theme.dart';

void main() => runApp(const ProviderScope(child: HoloRaidApp()));

class HoloRaidApp extends ConsumerWidget {
  const HoloRaidApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'HoloRaid',
      theme: holoTheme(),
      routerConfig: router,
    );
  }
}
