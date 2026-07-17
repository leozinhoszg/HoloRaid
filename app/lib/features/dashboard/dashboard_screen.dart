import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  late Future<Map<String, dynamic>> _stats;

  @override
  void initState() {
    super.initState();
    _stats = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    // Fronteiras calculadas no fuso LOCAL do dispositivo, enviadas como UTC.
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final month = DateTime(now.year, now.month, 1);
    final week = today.subtract(Duration(days: today.weekday % 7)); // início no domingo
    final res = await ref.read(apiClientProvider).dio.get('/dashboard', queryParameters: {
      'today': today.toUtc().toIso8601String(),
      'week': week.toUtc().toIso8601String(),
      'month': month.toUtc().toIso8601String(),
    });
    return (res.data as Map).cast<String, dynamic>();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _stats,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return Center(child: Text('Erro ao carregar: ${snap.error}'));
          final d = snap.data!;
          final raids = (d['raids'] as Map).cast<String, dynamic>();
          final ops = (d['topOperations'] as List).cast<dynamic>();
          final players = (d['topPlayers'] as List).cast<dynamic>();
          return RefreshIndicator(
            onRefresh: () async { setState(() { _stats = _load(); }); await _stats; },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Wrap(spacing: 12, runSpacing: 12, children: [
                  _statCard(context, 'Hoje', raids['today']),
                  _statCard(context, 'Semana', raids['week']),
                  _statCard(context, 'Mês', raids['month']),
                  _statCard(context, 'Participantes (mês)', d['participantsThisMonth']),
                ]),
                const SizedBox(height: 24),
                Text('Operations mais jogadas', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (ops.isEmpty) const Text('Sem dados ainda.'),
                ...ops.map((o) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.public),
                  title: Text(o['operation'] as String),
                  trailing: Text('${o['count']}'),
                )),
                const SizedBox(height: 16),
                Text('Jogadores mais ativos', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (players.isEmpty) const Text('Sem dados ainda.'),
                ...players.map((p) => ListTile(
                  dense: true,
                  leading: CircleAvatar(child: Text(((p['username'] as String?) ?? '?').substring(0, 1).toUpperCase())),
                  title: Text(p['username'] as String? ?? '—'),
                  trailing: Text('${p['raids']} raids'),
                )),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _statCard(BuildContext context, String label, Object? value) => Container(
    width: 150,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(12)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${value ?? 0}', style: Theme.of(context).textTheme.headlineMedium),
      Text(label, style: Theme.of(context).textTheme.bodySmall),
    ]),
  );
}
