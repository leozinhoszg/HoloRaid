import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'characters_providers.dart';

class CharacterProfileScreen extends ConsumerWidget {
  final int id;
  const CharacterProfileScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final char = ref.watch(characterProvider(id));
    return Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: char.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
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
                  Chip(label: Text(c.tier == 0 ? 'Sem Tier' : 'Tier ${c.tier}')),
                ]),
              ),
              const SizedBox(height: 16),
              Text('${c.totalPoints} pontos${next != null ? ' · faltam $next para o próximo Tier' : ' · máximo!'}'),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: progress),
              const SizedBox(height: 24),
              Text('Histórico', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              FutureBuilder<List<Map<String, dynamic>>>(
                future: ref.read(charactersRepositoryProvider).history(id),
                builder: (context, snap) {
                  if (!snap.hasData) return const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator());
                  final rows = snap.data!;
                  if (rows.isEmpty) return const Text('Nenhum boss concluído ainda.');
                  return Column(
                    children: rows
                        .map((r) => ListTile(
                              dense: true,
                              title: Text('${r['operation']} · ${r['boss']}'),
                              subtitle: Text('${r['difficulty'] ?? r['type']} · ${r['points']} pt'),
                            ))
                        .toList(),
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }
}
