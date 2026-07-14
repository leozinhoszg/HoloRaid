import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('RaidSync'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authStateProvider.notifier).logout(),
          ),
        ],
      ),
      body: Center(
        child: FutureBuilder<Map<String, dynamic>>(
          future: ref.read(authServiceProvider).loadMe(),
          builder: (context, snap) {
            if (!snap.hasData) return const CircularProgressIndicator();
            final me = snap.data!;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 32,
                  child: Text((me['username'] as String? ?? '?').substring(0, 1).toUpperCase()),
                ),
                const SizedBox(height: 12),
                Text(me['username'] as String? ?? 'sem nome',
                    style: Theme.of(context).textTheme.titleLarge),
                Text('Papel: ${me['role'] ?? '-'}'),
              ],
            );
          },
        ),
      ),
    );
  }
}
