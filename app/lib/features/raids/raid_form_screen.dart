import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/reference/reference_providers.dart';
import 'raids_providers.dart';

class RaidFormScreen extends ConsumerStatefulWidget {
  final int? editRaidId; // null = criar; != null = editar
  const RaidFormScreen({super.key, this.editRaidId});
  @override
  ConsumerState<RaidFormScreen> createState() => _RaidFormScreenState();
}

class _RaidFormScreenState extends ConsumerState<RaidFormScreen> {
  String? _operation;
  String _difficulty = 'HM';
  int _size = 8;
  String _faction = 'Republic';
  int _minTier = 0;
  bool _checkComp = false;
  bool _disableMentions = false;
  int _tank = 2, _heal = 2, _dps = 4;
  final _notes = TextEditingController();
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _time = const TimeOfDay(hour: 20, minute: 30);
  bool _saving = false;
  bool _loading = false;
  String? _error;

  bool get _isEdit => widget.editRaidId != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) {
      _loading = true;
      _prefill(widget.editRaidId!);
    }
  }

  Future<void> _prefill(int id) async {
    try {
      final r = await ref.read(raidsRepositoryProvider).get(id);
      if (!mounted) return;
      final local = r.startAt.toLocal();
      setState(() {
        _operation = r.operation;
        _difficulty = r.difficulty;
        _size = r.size;
        _faction = r.faction;
        _minTier = r.minimumTier;
        _checkComp = r.checkComposition;
        _tank = r.slotsTank;
        _heal = r.slotsHeal;
        _dps = r.slotsDps;
        _notes.text = r.notes ?? '';
        _date = local;
        _time = TimeOfDay(hour: local.hour, minute: local.minute);
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _loading = false; _error = 'Falha ao carregar a raid: $e'; });
    }
  }

  void _applyDefaults(int size) {
    setState(() {
      _size = size;
      if (size == 16) { _tank = 2; _heal = 4; _dps = 10; } else { _tank = 2; _heal = 2; _dps = 4; }
    });
  }

  int get _slotsSum => _tank + _heal + _dps;

  Future<void> _save() async {
    setState(() { _saving = true; _error = null; });
    final startAt = DateTime(_date.year, _date.month, _date.day, _time.hour, _time.minute).toUtc();
    try {
      final repo = ref.read(raidsRepositoryProvider);
      if (_isEdit) {
        await repo.update(widget.editRaidId!, {
          'minimum_tier': _minTier, 'check_composition': _checkComp,
          'slots_tank': _tank, 'slots_heal': _heal, 'slots_dps': _dps,
          'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          'start_at': startAt.toIso8601String(),
        });
        ref.invalidate(raidsListProvider);
        ref.invalidate(raidDetailProvider(widget.editRaidId!));
      } else {
        await repo.create({
          'operation': _operation, 'difficulty': _difficulty, 'size': _size, 'faction': _faction,
          'minimum_tier': _minTier, 'check_composition': _checkComp,
          'disable_mentions': _disableMentions,
          'slots_tank': _tank, 'slots_heal': _heal, 'slots_dps': _dps,
          'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          'start_at': startAt.toIso8601String(),
        });
        ref.invalidate(raidsListProvider);
      }
      if (mounted) context.pop();
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      setState(() => _error = code == 409
          ? 'A raid não está mais aberta para edição.'
          : code == 422
              ? 'Vagas inválidas (confira a soma e os já confirmados).'
              : 'Falha: ${e.message}');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ops = ref.watch(operationsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Editar raid' : 'Criar raid')),
      body: (_isEdit && _loading)
          ? const Center(child: CircularProgressIndicator())
          : ops.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Erro: $e')),
              data: (operations) => ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: _operation,
                    decoration: const InputDecoration(labelText: 'Operation'),
                    items: operations.map((o) => DropdownMenuItem(value: o, child: Text(o))).toList(),
                    onChanged: _isEdit ? null : (v) => setState(() => _operation = v),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _difficulty,
                    decoration: const InputDecoration(labelText: 'Difficulty'),
                    items: const [DropdownMenuItem(value: 'SM', child: Text('Story Mode')), DropdownMenuItem(value: 'HM', child: Text('Veteran (HM)')), DropdownMenuItem(value: 'NiM', child: Text('Master (NiM)'))],
                    onChanged: _isEdit ? null : (v) => setState(() => _difficulty = v!),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    initialValue: _size,
                    decoration: const InputDecoration(labelText: 'Size'),
                    items: const [DropdownMenuItem(value: 8, child: Text('8 players')), DropdownMenuItem(value: 16, child: Text('16 players'))],
                    onChanged: _isEdit ? null : (v) => _applyDefaults(v!),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _faction,
                    decoration: const InputDecoration(labelText: 'Facção'),
                    items: const [DropdownMenuItem(value: 'Republic', child: Text('Republic')), DropdownMenuItem(value: 'Empire', child: Text('Empire'))],
                    onChanged: _isEdit ? null : (v) => setState(() => _faction = v!),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<int>(
                    initialValue: _minTier,
                    decoration: const InputDecoration(labelText: 'Tier mínimo'),
                    items: List.generate(7, (i) => DropdownMenuItem(value: i, child: Text(i == 0 ? 'Sem Tier' : 'Tier $i'))),
                    onChanged: (v) => setState(() => _minTier = v!),
                  ),
                  SwitchListTile(
                    title: const Text('Check Composition'),
                    subtitle: const Text('Enforça vagas por role'),
                    value: _checkComp,
                    onChanged: (v) => setState(() => _checkComp = v),
                  ),
                  if (!_isEdit)
                    SwitchListTile(
                      title: const Text('Disable mentions'),
                      subtitle: const Text('Não pingar @here no Discord ao anunciar'),
                      value: _disableMentions,
                      onChanged: (v) => setState(() => _disableMentions = v),
                    ),
                  Row(children: [
                    Expanded(child: _slotField('Tank', _tank, (v) => setState(() => _tank = v))),
                    Expanded(child: _slotField('Heal', _heal, (v) => setState(() => _heal = v))),
                    Expanded(child: _slotField('DPS', _dps, (v) => setState(() => _dps = v))),
                  ]),
                  Text('Soma das vagas: $_slotsSum / $_size',
                      style: TextStyle(color: _slotsSum == _size ? null : Theme.of(context).colorScheme.error)),
                  const SizedBox(height: 12),
                  ListTile(
                    title: Text('Data: ${_date.toLocal().toString().split(' ').first}'),
                    trailing: const Icon(Icons.calendar_today),
                    onTap: () async {
                      final d = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2020), lastDate: DateTime(2030));
                      if (d != null) setState(() => _date = d);
                    },
                  ),
                  ListTile(
                    title: Text('Hora: ${_time.format(context)}'),
                    trailing: const Icon(Icons.access_time),
                    onTap: () async {
                      final t = await showTimePicker(context: context, initialTime: _time);
                      if (t != null) setState(() => _time = t);
                    },
                  ),
                  TextField(controller: _notes, decoration: const InputDecoration(labelText: 'Observações'), maxLines: 2),
                  const SizedBox(height: 16),
                  if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                  FilledButton(
                    onPressed: (_saving || _operation == null || _slotsSum != _size) ? null : _save,
                    child: Text(_saving ? 'Salvando...' : (_isEdit ? 'Salvar' : 'Criar raid')),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _slotField(String label, int value, ValueChanged<int> onChanged) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Column(children: [
          Text(label),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            IconButton(onPressed: value > 0 ? () => onChanged(value - 1) : null, icon: const Icon(Icons.remove)),
            Text('$value'),
            IconButton(onPressed: () => onChanged(value + 1), icon: const Icon(Icons.add)),
          ]),
        ]),
      );
}
