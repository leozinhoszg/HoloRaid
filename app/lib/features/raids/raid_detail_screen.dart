import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/config/app_config.dart';
import '../../core/ui/tier_badge.dart';
import '../characters/characters_providers.dart';
import 'raid_model.dart';
import 'raid_status_label.dart';
import 'raids_providers.dart';

class RaidDetailScreen extends ConsumerWidget {
  final int id;
  const RaidDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final raidAsync = ref.watch(raidDetailProvider(id));
    final auth = ref.watch(authStateProvider);
    final meId = auth is AuthSignedIn ? (auth.user['id'] as int?) : null;

    return Scaffold(
      appBar: AppBar(title: Text('raid_detail.title'.tr())),
      body: raidAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('common.error'.tr(namedArgs: {'error': '$e'}))),
        data: (raid) {
          final confirmed = raid.roster.where((r) => r.status == 'confirmed').toList();
          final waitlist = raid.roster.where((r) => r.status == 'waitlist').toList();
          final iAmIn = meId != null && raid.roster.any((r) => r.usuarioId == meId);
          final iAmLeader = meId != null && raid.createdBy == meId;
          final iAmAdmin = auth is AuthSignedIn && (auth.user['role'] as String?) == 'admin';
          int confirmedByRole(String role) => raid.roster.where((r) => r.status == 'confirmed' && r.role == role).length;
          final isFull = raid.checkComposition
              ? (confirmedByRole('Tank') >= raid.slotsTank && confirmedByRole('Healer') >= raid.slotsHeal && confirmedByRole('DPS') >= raid.slotsDps)
              : confirmed.length >= raid.size;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('${raid.operation} · ${raid.difficulty}', style: Theme.of(context).textTheme.headlineSmall),
              Text('raid_detail.meta_line'.tr(namedArgs: {
                'faction': raid.faction,
                'size': '${raid.size}',
                'tier': '${raid.minimumTier}',
                'status': raidStatusLabel(raid.status),
              })),
              Text('raid_detail.starts_at'.tr(namedArgs: {'date': '${raid.startAt.toLocal()}'})),
              if (raid.notes != null && raid.notes!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(raid.notes!)),
              if (isFull && raid.status == 'OPEN')
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: Theme.of(context).colorScheme.errorContainer, borderRadius: BorderRadius.circular(8)),
                  child: Row(children: [
                    const Icon(Icons.check_circle, size: 18),
                    const SizedBox(width: 8),
                    Text('raid_detail.full_starting'.tr(), style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer)),
                  ]),
                ),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                OutlinedButton.icon(onPressed: () => _share(context, raid), icon: const Icon(Icons.share), label: Text('raid_detail.share'.tr())),
                if (raid.status == 'OPEN' && !iAmIn) FilledButton.icon(onPressed: () => _join(context, ref, raid), icon: const Icon(Icons.login), label: Text('raid_detail.join'.tr())),
                if (raid.status == 'OPEN' && iAmIn) OutlinedButton.icon(onPressed: () => _leave(context, ref), icon: const Icon(Icons.logout), label: Text('raid_detail.leave'.tr())),
              ]),
              if (iAmLeader || iAmAdmin) Wrap(spacing: 8, children: [
                if (raid.status == 'OPEN') TextButton(onPressed: () => context.push('/raids/${raid.id}/edit'), child: Text('common.edit'.tr())),
                if (raid.status == 'OPEN') TextButton(onPressed: () => _transition(context, ref, 'start'), child: Text('raid_detail.start'.tr())),
                if (raid.status == 'OPEN' || raid.status == 'RUNNING') TextButton(onPressed: () => _transition(context, ref, 'finish'), child: Text('raid_detail.finish'.tr())),
                if (raid.status == 'OPEN' || raid.status == 'RUNNING') TextButton(onPressed: () => _transition(context, ref, 'cancel'), child: Text('common.cancel'.tr())),
                TextButton(onPressed: () => _duplicate(context, ref), child: Text('raid_detail.duplicate'.tr())),
                TextButton(onPressed: () => _delete(context, ref), style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error), child: Text('common.delete'.tr())),
              ]),
              const Divider(),
              Text('raid_detail.confirmed_count'.tr(namedArgs: {'n': '${confirmed.length}', 'total': '${raid.size}'}), style: Theme.of(context).textTheme.titleMedium),
              ...confirmed.map(_playerTile),
              if (waitlist.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('raid_detail.waitlist_count'.tr(namedArgs: {'n': '${waitlist.length}'}), style: Theme.of(context).textTheme.titleMedium),
                ...waitlist.map(_playerTile),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _playerTile(RosterEntry r) => ListTile(
        dense: true,
        leading: CircleAvatar(child: Text(r.role[0])),
        title: Text('${r.nome} (${r.classe})'),
        subtitle: Text('raid_detail.player_subtitle'.tr(namedArgs: {'role': r.role, 'ilvl': '${r.itemLevel}'})),
        trailing: TierBadge(tier: r.tier, compact: true),
      );

  Future<void> _join(BuildContext context, WidgetRef ref, Raid raid) async {
    final chars = await ref.read(charactersRepositoryProvider).list();
    final eligible = chars.where((c) => c.faccao == raid.faction && c.tier >= raid.minimumTier).toList();
    if (!context.mounted) return;
    if (eligible.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('raid_detail.no_eligible'.tr())));
      return;
    }
    final chosen = await showModalBottomSheet<int>(
      context: context,
      builder: (_) => ListView(children: eligible.map((c) => ListTile(
        title: Text('${c.nome} · ${c.classe} · ${c.role}'),
        subtitle: Text(c.tier == 0 ? 'common.no_tier'.tr() : 'common.tier'.tr(namedArgs: {'n': '${c.tier}'})),
        onTap: () => Navigator.pop(context, c.id),
      )).toList()),
    );
    if (chosen == null) return;
    try {
      final status = await ref.read(raidsRepositoryProvider).join(raid.id, chosen);
      ref.invalidate(raidDetailProvider(raid.id));
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(status == 'confirmed' ? 'raid_detail.joined_confirmed'.tr() : 'raid_detail.joined_waitlist'.tr())));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('common.error'.tr(namedArgs: {'error': '$e'}))));
    }
  }

  Future<void> _leave(BuildContext context, WidgetRef ref) async {
    await ref.read(raidsRepositoryProvider).leave(id);
    ref.invalidate(raidDetailProvider(id));
  }

  Future<void> _transition(BuildContext context, WidgetRef ref, String action) async {
    await ref.read(raidsRepositoryProvider).transition(id, action);
    ref.invalidate(raidDetailProvider(id));
  }

  Future<void> _duplicate(BuildContext context, WidgetRef ref) async {
    try {
      final copy = await ref.read(raidsRepositoryProvider).duplicate(id);
      ref.invalidate(raidsListProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('raid_detail.duplicated'.tr(namedArgs: {'code': copy.codigo}))));
        context.push('/raids/${copy.id}');
      }
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('raid_detail.duplicate_failed'.tr(namedArgs: {'error': '$e'}))));
    }
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('raid_detail.delete_title'.tr()),
        content: Text('raid_detail.delete_body'.tr()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text('common.cancel'.tr())),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text('common.delete'.tr())),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(raidsRepositoryProvider).remove(id);
      ref.invalidate(raidsListProvider);
      if (context.mounted) context.canPop() ? context.pop() : context.go('/raids');
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('raid_detail.delete_failed'.tr(namedArgs: {'error': '$e'}))));
    }
  }

  void _share(BuildContext context, Raid raid) {
    final url = '${AppConfig.appPublicUrl}/r/${raid.codigo}';
    showDialog(context: context, builder: (_) => AlertDialog(
      title: Text('raid_detail.share_title'.tr()),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        SelectableText(url),
        const SizedBox(height: 12),
        QrImageView(data: url, size: 180),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text('common.close'.tr()))],
    ));
  }
}
