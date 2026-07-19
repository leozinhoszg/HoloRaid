import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'raid_status_label.dart';
import 'raids_providers.dart';

class RaidsListScreen extends ConsumerWidget {
  const RaidsListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final raids = ref.watch(raidsListProvider);
    return raids.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('common.error'.tr(namedArgs: {'error': '$e'}))),
        data: (list) => list.isEmpty
            ? Center(child: Text('raids.empty'.tr()))
            : RefreshIndicator(
                onRefresh: () async => ref.refresh(raidsListProvider.future),
                child: ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final r = list[i];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: ListTile(
                        onTap: () => context.push('/raids/${r.id}'),
                        title: Text('${r.operation} · ${r.difficulty}'),
                        subtitle: Text('raids.list_subtitle'.tr(namedArgs: {
                          'faction': r.faction,
                          'size': '${r.size}',
                          'tier': '${r.minimumTier}',
                          'date': '${r.startAt.toLocal()}',
                        })),
                        isThreeLine: true,
                        trailing: Chip(label: Text(raidStatusLabel(r.status))),
                      ),
                    );
                  },
                ),
              ),
      );
  }
}
