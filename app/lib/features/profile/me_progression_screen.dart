import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';

class MeProgressionScreen extends ConsumerStatefulWidget {
  const MeProgressionScreen({super.key});
  @override
  ConsumerState<MeProgressionScreen> createState() => _State();
}

class _State extends ConsumerState<MeProgressionScreen> {
  Map<String, List<Map<String, dynamic>>> _byOp = {};
  final Set<int> _checked = {};
  bool _loading = true, _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = ref.read(apiClientProvider);
    final cat = await api.dio.get('/reference/bosses');
    final mine = await api.dio.get('/me/bosses');
    final byOp = <String, List<Map<String, dynamic>>>{};
    for (final b in (cat.data['bosses'] as List)) {
      final m = (b as Map).cast<String, dynamic>();
      byOp.putIfAbsent(m['operation'] as String, () => []).add(m);
    }
    setState(() {
      _byOp = byOp;
      _checked.addAll((mine.data as List).map((e) => (e as Map)['boss_id'] as int));
      _loading = false;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final api = ref.read(apiClientProvider);
    await api.dio.put('/me/bosses', data: {'bossIds': _checked.toList()});
    if (mounted) { setState(() => _saving = false); context.pop(); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Minha progressão PvE'),
        actions: [TextButton(onPressed: _saving ? null : _save, child: Text(_saving ? '...' : 'Salvar'))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: _byOp.entries.map((entry) => ExpansionTile(
                title: Text(entry.key),
                children: entry.value.map((b) {
                  final bid = b['id'] as int;
                  final diff = b['difficulty'] ?? b['type'];
                  return CheckboxListTile(
                    dense: true,
                    value: _checked.contains(bid),
                    title: Text('${b['boss']} · $diff'),
                    onChanged: (v) => setState(() => v == true ? _checked.add(bid) : _checked.remove(bid)),
                  );
                }).toList(),
              )).toList(),
            ),
    );
  }
}
