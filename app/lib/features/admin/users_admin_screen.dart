import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'admin_repository.dart';

class UsersAdminScreen extends ConsumerStatefulWidget {
  const UsersAdminScreen({super.key});
  @override
  ConsumerState<UsersAdminScreen> createState() => _UsersAdminScreenState();
}

class _UsersAdminScreenState extends ConsumerState<UsersAdminScreen> {
  late Future<List<Map<String, dynamic>>> _users;

  @override
  void initState() {
    super.initState();
    _users = ref.read(adminRepositoryProvider).listUsers();
  }

  void _reload() => setState(() { _users = ref.read(adminRepositoryProvider).listUsers(); });

  Future<void> _act(Future<void> Function() action) async {
    try {
      await action();
      _reload();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Falha: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Map<String, dynamic>>>(
        future: _users,
        builder: (context, snap) {
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final users = snap.data!;
          return RefreshIndicator(
            onRefresh: () async { _reload(); await _users; },
            child: ListView(
              children: users.map((u) {
                final id = u['id'] as int;
                final role = u['role'] as String? ?? 'user';
                final isAdmin = role == 'admin';
                return ListTile(
                  leading: CircleAvatar(child: Text((u['username'] as String? ?? '?').substring(0, 1).toUpperCase())),
                  title: Text(u['username'] as String? ?? '—'),
                  subtitle: Text(role),
                  trailing: isAdmin
                      ? OutlinedButton(onPressed: () => _act(() => ref.read(adminRepositoryProvider).demote(id)), child: const Text('Rebaixar'))
                      : FilledButton(onPressed: () => _act(() => ref.read(adminRepositoryProvider).promote(id)), child: const Text('Promover')),
                );
              }).toList(),
            ),
          );
        },
      );
  }
}
