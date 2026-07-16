import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';
import 'characters_providers.dart';

class CharacterProgressionScreen extends ConsumerStatefulWidget {
  final int id;
  const CharacterProgressionScreen({super.key, required this.id});
  @override
  ConsumerState<CharacterProgressionScreen> createState() => _State();
}

class _State extends ConsumerState<CharacterProgressionScreen> {
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
    final ref1 = await api.dio.get('/reference/bosses');
    final me = await ref.read(charactersRepositoryProvider).history(widget.id);
    final byOp = <String, List<Map<String, dynamic>>>{};
    for (final b in (ref1.data['bosses'] as List)) {
      final m = (b as Map).cast<String, dynamic>();
      byOp.putIfAbsent(m['operation'] as String, () => []).add(m);
    }
    setState(() {
      _byOp = byOp;
      _checked.addAll(me.map((e) => e['boss_id'] as int));
      _loading = false;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final api = ref.read(apiClientProvider);
    await api.dio.put('/characters/${widget.id}/bosses', data: {'bossIds': _checked.toList()});
    ref.invalidate(characterProvider(widget.id));
    if (mounted) { setState(() => _saving = false); context.pop(); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Marcar bosses'),
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
