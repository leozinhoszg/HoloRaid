import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/reference/reference_providers.dart';
import 'raids_providers.dart';

class RaidFormScreen extends ConsumerStatefulWidget {
  const RaidFormScreen({super.key});
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
  int _tank = 2, _heal = 2, _dps = 4;
  final _notes = TextEditingController();
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _time = const TimeOfDay(hour: 20, minute: 30);
  bool _saving = false;
  String? _error;

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
      await ref.read(raidsRepositoryProvider).create({
        'operation': _operation, 'difficulty': _difficulty, 'size': _size, 'faction': _faction,
        'minimum_tier': _minTier, 'check_composition': _checkComp,
        'slots_tank': _tank, 'slots_heal': _heal, 'slots_dps': _dps,
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        'start_at': startAt.toIso8601String(),
      });
      ref.invalidate(raidsProvider);
      if (mounted) context.pop();
    } on DioException catch (e) {
      setState(() => _error = e.response?.statusCode == 422 ? 'Dados inválidos (confira as vagas somando o size).' : 'Falha: ${e.message}');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ops = ref.watch(operationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Criar raid')),
      body: ops.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (operations) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            DropdownButtonFormField<String>(
              initialValue: _operation,
              decoration: const InputDecoration(labelText: 'Operation'),
              items: operations.map((o) => DropdownMenuItem(value: o, child: Text(o))).toList(),
              onChanged: (v) => setState(() => _operation = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _difficulty,
              decoration: const InputDecoration(labelText: 'Difficulty'),
              items: const [DropdownMenuItem(value: 'SM', child: Text('Story Mode')), DropdownMenuItem(value: 'HM', child: Text('Veteran (HM)')), DropdownMenuItem(value: 'NiM', child: Text('Master (NiM)'))],
              onChanged: (v) => setState(() => _difficulty = v!),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<int>(
              initialValue: _size,
              decoration: const InputDecoration(labelText: 'Size'),
              items: const [DropdownMenuItem(value: 8, child: Text('8 players')), DropdownMenuItem(value: 16, child: Text('16 players'))],
              onChanged: (v) => _applyDefaults(v!),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _faction,
              decoration: const InputDecoration(labelText: 'Facção'),
              items: const [DropdownMenuItem(value: 'Republic', child: Text('Republic')), DropdownMenuItem(value: 'Empire', child: Text('Empire'))],
              onChanged: (v) => setState(() => _faction = v!),
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
              child: Text(_saving ? 'Salvando...' : 'Criar raid'),
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
