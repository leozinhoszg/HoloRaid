import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/ui/holo_button.dart';
import '../characters/characters_providers.dart';
import '../home/home_providers.dart';

/// Progressão PvE da conta (destino do app shell — body-only).
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
    // O Tier da conta mudou: refaz o /me (badge do menu/perfil) e a lista de
    // personagens (badge por char deriva do Tier da conta).
    ref.invalidate(meProvider);
    ref.invalidate(charactersProvider);
    if (!mounted) return;
    setState(() => _saving = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('progression.saved'.tr())));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 680),
        child: Column(children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.only(top: 4, bottom: 8),
              children: _byOp.entries
                  .map((entry) => Card(
                        clipBehavior: Clip.antiAlias,
                        child: ExpansionTile(
                          title: Text(entry.key, style: const TextStyle(fontFamily: 'Orbitron', fontSize: 15)),
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
                        ),
                      ))
                  .toList(),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: HoloButton(label: 'progression.save'.tr(), loading: _saving, onPressed: _save),
            ),
          ),
        ]),
      ),
    );
  }
}
