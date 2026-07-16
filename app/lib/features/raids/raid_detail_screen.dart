import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/config/app_config.dart';
import '../characters/characters_providers.dart';
import 'raid_model.dart';
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
      appBar: AppBar(title: const Text('Raid')),
      body: raidAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (raid) {
          final confirmed = raid.roster.where((r) => r.status == 'confirmed').toList();
          final waitlist = raid.roster.where((r) => r.status == 'waitlist').toList();
          final iAmIn = meId != null && raid.roster.any((r) => r.usuarioId == meId);
          final iAmLeader = meId != null && raid.createdBy == meId;
          int confirmedByRole(String role) => raid.roster.where((r) => r.status == 'confirmed' && r.role == role).length;
          final isFull = raid.checkComposition
              ? (confirmedByRole('Tank') >= raid.slotsTank && confirmedByRole('Healer') >= raid.slotsHeal && confirmedByRole('DPS') >= raid.slotsDps)
              : confirmed.length >= raid.size;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('${raid.operation} · ${raid.difficulty}', style: Theme.of(context).textTheme.headlineSmall),
              Text('${raid.faction} · ${raid.size} players · Tier mín. ${raid.minimumTier} · ${raid.status}'),
              Text('Início: ${raid.startAt.toLocal()}'),
              if (raid.notes != null && raid.notes!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(raid.notes!)),
              if (isFull && raid.status == 'OPEN')
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: Theme.of(context).colorScheme.errorContainer, borderRadius: BorderRadius.circular(8)),
                  child: Row(children: [
                    const Icon(Icons.check_circle, size: 18),
                    const SizedBox(width: 8),
                    Text('Raid cheia — vai começar!', style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer)),
                  ]),
                ),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                OutlinedButton.icon(onPressed: () => _share(context, raid), icon: const Icon(Icons.share), label: const Text('Compartilhar')),
                if (raid.status == 'OPEN' && !iAmIn) FilledButton.icon(onPressed: () => _join(context, ref, raid), icon: const Icon(Icons.login), label: const Text('Entrar')),
                if (raid.status == 'OPEN' && iAmIn) OutlinedButton.icon(onPressed: () => _leave(context, ref), icon: const Icon(Icons.logout), label: const Text('Sair')),
              ]),
              if (iAmLeader) Wrap(spacing: 8, children: [
                if (raid.status == 'OPEN') TextButton(onPressed: () => _transition(context, ref, 'start'), child: const Text('Iniciar')),
                if (raid.status == 'OPEN' || raid.status == 'RUNNING') TextButton(onPressed: () => _transition(context, ref, 'finish'), child: const Text('Encerrar')),
                if (raid.status == 'OPEN' || raid.status == 'RUNNING') TextButton(onPressed: () => _transition(context, ref, 'cancel'), child: const Text('Cancelar')),
              ]),
              const Divider(),
              Text('Confirmados (${confirmed.length}/${raid.size})', style: Theme.of(context).textTheme.titleMedium),
              ...confirmed.map(_playerTile),
              if (waitlist.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Lista de espera (${waitlist.length})', style: Theme.of(context).textTheme.titleMedium),
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
        subtitle: Text('${r.role} · iLvl ${r.itemLevel}'),
        trailing: Chip(label: Text(r.tier == 0 ? 'Sem Tier' : 'Tier ${r.tier}')),
      );

  Future<void> _join(BuildContext context, WidgetRef ref, Raid raid) async {
    final chars = await ref.read(charactersRepositoryProvider).list();
    final eligible = chars.where((c) => c.faccao == raid.faction && c.tier >= raid.minimumTier).toList();
    if (!context.mounted) return;
    if (eligible.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nenhum personagem elegível (facção/Tier).')));
      return;
    }
    final chosen = await showModalBottomSheet<int>(
      context: context,
      builder: (_) => ListView(children: eligible.map((c) => ListTile(
        title: Text('${c.nome} · ${c.classe} · ${c.role}'),
        subtitle: Text(c.tier == 0 ? 'Sem Tier' : 'Tier ${c.tier}'),
        onTap: () => Navigator.pop(context, c.id),
      )).toList()),
    );
    if (chosen == null) return;
    try {
      final status = await ref.read(raidsRepositoryProvider).join(raid.id, chosen);
      ref.invalidate(raidDetailProvider(raid.id));
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(status == 'confirmed' ? 'Confirmado!' : 'Você entrou na lista de espera.')));
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro: $e')));
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

  void _share(BuildContext context, Raid raid) {
    final url = '${AppConfig.appPublicUrl}/r/${raid.codigo}';
    showDialog(context: context, builder: (_) => AlertDialog(
      title: const Text('Compartilhar raid'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        SelectableText(url),
        const SizedBox(height: 12),
        QrImageView(data: url, size: 180),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Fechar'))],
    ));
  }
}
