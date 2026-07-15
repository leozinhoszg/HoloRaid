import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'characters_providers.dart';

class CharactersListScreen extends ConsumerWidget {
  const CharactersListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chars = ref.watch(charactersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Meus Personagens')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/characters/new'),
        icon: const Icon(Icons.add),
        label: const Text('Novo'),
      ),
      body: chars.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (list) => list.isEmpty
            ? const Center(child: Text('Nenhum personagem ainda. Crie o primeiro!'))
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
                        subtitle: Text('${c.classe} · ${c.role} · iLvl ${c.itemLevel}'),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Chip(label: Text(c.tier == 0 ? 'Sem Tier' : 'Tier ${c.tier}')),
                            Text('${c.totalPoints} pts', style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
