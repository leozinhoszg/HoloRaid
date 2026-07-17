import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('HoloRaid'),
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
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: () => context.push('/characters'),
                  icon: const Icon(Icons.people),
                  label: const Text('Meus Personagens'),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/raids'),
                  icon: const Icon(Icons.event),
                  label: const Text('Raids'),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/dashboard'),
                  icon: const Icon(Icons.bar_chart),
                  label: const Text('Dashboard'),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/profile'),
                  icon: const Icon(Icons.person),
                  label: const Text('Perfil'),
                ),
                if ((me['role'] as String?) == 'admin') ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => context.push('/admin/users'),
                    icon: const Icon(Icons.admin_panel_settings),
                    label: const Text('Admin'),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}
