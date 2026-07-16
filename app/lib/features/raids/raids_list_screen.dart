import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'raids_providers.dart';

class RaidsListScreen extends ConsumerWidget {
  const RaidsListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final raids = ref.watch(raidsProvider(null));
    return Scaffold(
      appBar: AppBar(title: const Text('Raids')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/raids/new'),
        icon: const Icon(Icons.add),
        label: const Text('Criar raid'),
      ),
      body: raids.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (list) => list.isEmpty
            ? const Center(child: Text('Nenhuma raid ainda.'))
            : RefreshIndicator(
                onRefresh: () async => ref.refresh(raidsProvider(null).future),
                child: ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final r = list[i];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      child: ListTile(
                        onTap: () => context.push('/raids/${r.id}'),
                        title: Text('${r.operation} · ${r.difficulty}'),
                        subtitle: Text('${r.faction} · ${r.size} players · Tier mín. ${r.minimumTier}\n'
                            '${r.startAt.toLocal()}'),
                        isThreeLine: true,
                        trailing: Chip(label: Text(r.status)),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
