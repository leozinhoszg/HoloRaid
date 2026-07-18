import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/ui/holo_avatar.dart';
import '../../core/ui/holo_palette.dart';
import '../characters/characters_providers.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  late Future<Map<String, dynamic>> _me;
  late Future<List<dynamic>> _raids;

  @override
  void initState() {
    super.initState();
    _me = ref.read(authServiceProvider).loadMe();
    _raids = _loadRaids();
  }

  Future<List<dynamic>> _loadRaids() async {
    final res = await ref.read(apiClientProvider).dio.get('/me/raids');
    return (res.data as List).cast<dynamic>();
  }

  @override
  Widget build(BuildContext context) {
    final chars = ref.watch(charactersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _me,
        builder: (context, meSnap) {
          if (!meSnap.hasData) return const Center(child: CircularProgressIndicator());
          final me = meSnap.data!;
          final discordId = me['discord_id']?.toString();
          final avatar = me['avatar'] as String?;
          final avatarUrl = (discordId != null && avatar != null && avatar.isNotEmpty)
              ? 'https://cdn.discordapp.com/avatars/$discordId/$avatar.png'
              : null;
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 680),
              child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(children: [
                HoloAvatar(url: avatarUrl, label: me['username'] as String? ?? '?', size: 60),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(me['username'] as String? ?? '—', style: Theme.of(context).textTheme.titleLarge),
                    Text('Papel: ${me['role'] ?? '-'}', style: Theme.of(context).textTheme.bodySmall),
                  ]),
                ),
              ]),
              const SizedBox(height: 20),
              chars.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text('Erro nos personagens: $e'),
                data: (list) {
                  final totalPontos = list.fold<int>(0, (s, c) => s + c.totalPoints);
                  final maiorTier = list.fold<int>(0, (m, c) => c.tier > m ? c.tier : m);
                  return Card(child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
                      _mini('Personagens', '${list.length}'),
                      _mini('Pontos PvE', '$totalPontos'),
                      _mini('Maior Tier', maiorTier == 0 ? '—' : 'T$maiorTier'),
                    ]),
                  ));
                },
              ),
              const SizedBox(height: 20),
              Text('Minhas raids', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              FutureBuilder<List<dynamic>>(
                future: _raids,
                builder: (context, rSnap) {
                  if (!rSnap.hasData) return const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()));
                  final raids = rSnap.data!;
                  if (raids.isEmpty) return const Text('Você ainda não participou de raids.');
                  return Column(children: raids.map((r) {
                    final m = (r as Map).cast<String, dynamic>();
                    final quando = DateTime.parse(m['start_at'] as String).toLocal();
                    final badge = (m['created'] as bool? ?? false)
                        ? 'Criador'
                        : (m['myStatus'] == 'confirmed' ? 'Confirmado' : m['myStatus'] == 'waitlist' ? 'Waitlist' : '—');
                    return ListTile(
                      dense: true,
                      title: Text('${m['operation']} · ${m['difficulty']}'),
                      subtitle: Text('${quando.toString().substring(0, 16)} · ${m['status']}'),
                      trailing: Chip(label: Text(badge)),
                      onTap: () => context.push('/raids/${m['id']}'),
                    );
                  }).toList());
                },
              ),
            ],
          ),
            ),
          );
        },
      ),
    );
  }

  Widget _mini(String label, String value) => Column(children: [
    Text(value, style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 22, color: HoloPalette.blue)),
    const SizedBox(height: 4),
    Text(label, style: const TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 1.5, color: HoloPalette.faint)),
  ]);
}
