import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/ui/holo_button.dart';
import '../characters/characters_providers.dart';
import '../home/home_providers.dart';

/// Uma linha de boss: até dois ids (Veteran/Master). Só os presentes viram checkbox.
class _BossRow {
  _BossRow(this.name);
  final String name;
  int? vet;
  int? master;
}

/// Progressão PvE da conta (destino do app shell — body-only).
class MeProgressionScreen extends ConsumerStatefulWidget {
  const MeProgressionScreen({super.key});
  @override
  ConsumerState<MeProgressionScreen> createState() => _State();
}

class _State extends ConsumerState<MeProgressionScreen> {
  // Operações (type='boss') na ordem de primeira aparição do catálogo.
  final List<MapEntry<String, List<_BossRow>>> _ops = [];
  final List<_BossRow> _lairs = []; // type='lair'
  final List<MapEntry<String, int>> _timers = []; // (operação, bossId), type='timer'
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

    final ops = <String, Map<String, _BossRow>>{}; // op -> boss -> row
    final lairs = <String, _BossRow>{}; // boss -> row
    final timers = <MapEntry<String, int>>[];

    for (final raw in (cat.data['bosses'] as List)) {
      final b = (raw as Map).cast<String, dynamic>();
      final id = b['id'] as int;
      final type = b['type'] as String;
      final op = b['operation'] as String;
      final name = b['boss'] as String;
      final diff = b['difficulty'] as String?; // 'Veteran' | 'Master' | null

      if (type == 'timer') {
        timers.add(MapEntry(op, id));
        continue;
      }
      final _BossRow row = type == 'lair'
          ? lairs.putIfAbsent(name, () => _BossRow(name))
          : ops.putIfAbsent(op, () => {}).putIfAbsent(name, () => _BossRow(name));
      if (diff == 'Master') {
        row.master = id;
      } else {
        row.vet = id;
      }
    }

    setState(() {
      _ops
        ..clear()
        ..addAll(ops.entries.map((e) => MapEntry(e.key, e.value.values.toList())));
      _lairs
        ..clear()
        ..addAll(lairs.values);
      _timers
        ..clear()
        ..addAll(timers);
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

  /// Checkbox tappável com rótulo (Veteran/Master/Timed). Só o InkWell trata o
  /// toque — o Checkbox ignora ponteiro pra não disparar toggle duplo.
  Widget _diffCheck(String label, int id) {
    final on = _checked.contains(id);
    return InkWell(
      onTap: () => setState(() => on ? _checked.remove(id) : _checked.add(id)),
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          IgnorePointer(
            child: Checkbox(
              value: on,
              visualDensity: VisualDensity.compact,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              onChanged: (_) {},
            ),
          ),
          const SizedBox(width: 2),
          Text(label),
        ]),
      ),
    );
  }

  Widget _bossTile(_BossRow r) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
        child: Row(children: [
          Expanded(child: Text(r.name)),
          if (r.vet != null) _diffCheck('Veteran', r.vet!),
          if (r.master != null) _diffCheck('Master', r.master!),
        ]),
      );

  Widget _timerTile(String op, int id) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
        child: Row(children: [
          Expanded(child: Text(op)),
          _diffCheck('progression.timed'.tr(), id),
        ]),
      );

  Widget _section(String title, List<Widget> children) => Card(
        clipBehavior: Clip.antiAlias,
        child: ExpansionTile(
          title: Text(title, style: const TextStyle(fontFamily: 'Orbitron', fontSize: 15)),
          childrenPadding: const EdgeInsets.only(bottom: 8),
          children: children,
        ),
      );

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
              children: [
                for (final op in _ops) _section(op.key, [for (final r in op.value) _bossTile(r)]),
                if (_lairs.isNotEmpty)
                  _section('progression.lair_bosses'.tr(), [for (final r in _lairs) _bossTile(r)]),
                if (_timers.isNotEmpty)
                  _section('progression.timers'.tr(), [for (final t in _timers) _timerTile(t.key, t.value)]),
              ],
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
