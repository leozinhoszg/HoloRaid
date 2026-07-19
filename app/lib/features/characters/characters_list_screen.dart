import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/ui/tier_badge.dart';
import 'characters_providers.dart';

class CharactersListScreen extends ConsumerWidget {
  const CharactersListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chars = ref.watch(charactersProvider);
    return chars.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('common.error'.tr(namedArgs: {'error': '$e'}))),
        data: (list) => list.isEmpty
            ? Center(child: Text('characters.empty'.tr()))
            : RefreshIndicator(
                onRefresh: () async => ref.refresh(charactersProvider.future),
                child: ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final c = list[i];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: ListTile(
                        onTap: () => context.push('/characters/${c.id}'),
                        leading: CircleAvatar(child: Text(c.role[0])),
                        title: Text(c.nome),
                        subtitle: Text('characters.list_subtitle'.tr(namedArgs: {'class': c.classe, 'role': c.role, 'ilvl': '${c.itemLevel}'})),
                        trailing: TierBadge(tier: c.tier, compact: true),
                      ),
                    );
                  },
                ),
              ),
      );
  }
}
