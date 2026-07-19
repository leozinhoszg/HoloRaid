import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/ui/tier_badge.dart';
import 'characters_providers.dart';

class CharacterProfileScreen extends ConsumerWidget {
  final int id;
  const CharacterProfileScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final char = ref.watch(characterProvider(id));
    return Scaffold(
      appBar: AppBar(title: Text('common.profile'.tr())),
      body: char.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('common.error'.tr(namedArgs: {'error': '$e'}))),
        data: (c) {
          final next = c.pointsToNextTier;
          final progress = next == null ? 1.0 : (c.totalPoints / (c.totalPoints + next)).clamp(0.0, 1.0);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Center(
                child: Column(children: [
                  CircleAvatar(radius: 36, child: Text(c.role[0], style: const TextStyle(fontSize: 24))),
                  const SizedBox(height: 8),
                  Text(c.nome, style: Theme.of(context).textTheme.headlineSmall),
                  Text('${c.faccao} · ${c.classe}${c.especializacao != null ? ' · ${c.especializacao}' : ''} · ${c.role}'),
                  const SizedBox(height: 8),
                  TierBadge(tier: c.tier),
                ]),
              ),
              const SizedBox(height: 16),
              // Tier/pontos são da CONTA (iguais em todos os personagens). Marque bosses no menu "Progressão".
              Text('${'character_profile.points'.tr(namedArgs: {'n': '${c.totalPoints}'})}'
                  '${next != null ? ' · ${'character_profile.to_next_tier'.tr(namedArgs: {'n': '$next'})}' : ' · ${'character_profile.max'.tr()}'}'
                  ' · ${'character_profile.account_tier'.tr()}'),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: progress),
            ],
          );
        },
      ),
    );
  }
}
