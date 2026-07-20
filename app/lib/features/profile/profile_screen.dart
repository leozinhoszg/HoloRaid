import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/settings/language_selector.dart';
import '../../core/ui/holo_avatar.dart';
import '../../core/ui/tier_badge.dart';
import '../raids/raid_status_label.dart';

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
      appBar: AppBar(title: Text('common.profile'.tr())),
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
                    Text('profile.role'.tr(namedArgs: {'role': '${me['role'] ?? '-'}'}), style: Theme.of(context).textTheme.bodySmall),
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
                      Text('profile.points'.tr(namedArgs: {'n': '$pts'}), style: Theme.of(context).textTheme.bodyMedium),
                    ]),
                    const SizedBox(height: 10),
                    LinearProgressIndicator(value: progress),
                    const SizedBox(height: 6),
                    Text(next != null ? 'profile.to_next_tier'.tr(namedArgs: {'n': '$next'}) : 'profile.max_tier'.tr(),
                        style: Theme.of(context).textTheme.bodySmall),
                  ]),
                ));
              }),
              const SizedBox(height: 20),
              Text('profile.my_raids'.tr(), style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              FutureBuilder<List<dynamic>>(
                future: _raids,
                builder: (context, rSnap) {
                  if (!rSnap.hasData) return const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()));
                  final raids = rSnap.data!;
                  if (raids.isEmpty) return Text('profile.no_raids'.tr());
                  return Column(children: raids.map((r) {
                    final m = (r as Map).cast<String, dynamic>();
                    final quando = DateTime.parse(m['start_at'] as String).toLocal();
                    final badge = (m['created'] as bool? ?? false)
                        ? 'common.creator'.tr()
                        : (m['myStatus'] == 'confirmed' ? 'common.confirmed'.tr() : m['myStatus'] == 'waitlist' ? 'common.waitlist'.tr() : '—');
                    return ListTile(
                      dense: true,
                      title: Text('${m['operation']} · ${m['difficulty']}'),
                      subtitle: Text('profile.raid_subtitle'.tr(namedArgs: {'date': quando.toString().substring(0, 16), 'status': raidStatusLabel('${m['status']}')})),
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
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: GlassLanguageSelector(),
                ),
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
