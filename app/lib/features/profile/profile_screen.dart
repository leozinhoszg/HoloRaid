import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/settings/language_selector.dart';
import '../../core/ui/holo_avatar.dart';
import '../../core/ui/tier_badge.dart';

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
              Builder(builder: (context) {
                final pts = (me['total_points'] as int?) ?? 0;
                final tier = (me['tier'] as int?) ?? 0;
                final next = me['pointsToNextTier'] as int?;
                final progress = next == null ? 1.0 : (pts / (pts + next)).clamp(0.0, 1.0);
                return Card(child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      TierBadge(tier: tier),
                      const Spacer(),
                      Text('$pts pontos', style: Theme.of(context).textTheme.bodyMedium),
                    ]),
                    const SizedBox(height: 10),
                    LinearProgressIndicator(value: progress),
                    const SizedBox(height: 6),
                    Text(next != null ? 'faltam $next para o próximo Tier' : 'Tier máximo!',
                        style: Theme.of(context).textTheme.bodySmall),
                  ]),
                ));
              }),
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
              const SizedBox(height: 20),
              const Divider(),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: LanguageSelector(),
              ),
            ],
          ),
            ),
          );
        },
      ),
    );
  }
}
