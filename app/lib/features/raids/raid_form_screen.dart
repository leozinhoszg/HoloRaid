import 'package:dio/dio.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/reference/reference_providers.dart';
import '../../core/ui/holo_button.dart';
import '../../core/ui/holo_dropdown.dart';
import '../../core/ui/holo_palette.dart';
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
      if (mounted) setState(() { _loading = false; _error = 'raid_form.load_failed'.tr(namedArgs: {'error': '$e'}); });
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
          ? 'raid_form.not_open_edit'.tr()
          : code == 422
              ? 'raid_form.invalid_slots'.tr()
              : 'raid_form.save_failed'.tr(namedArgs: {'error': '${e.message}'}));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ops = ref.watch(operationsProvider);
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'raid_form.title_edit'.tr() : 'raid_form.title_create'.tr())),
      body: (_isEdit && _loading)
          ? const Center(child: CircularProgressIndicator())
          : ops.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('common.error'.tr(namedArgs: {'error': '$e'}))),
              data: (operations) => Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                children: [
                  HoloDropdown<String>(
                    key: const ValueKey('f_operation'),
                    label: 'raid_form.f_operation'.tr(),
                    value: _operation,
                    items: operations.map((o) => HoloDropdownItem(o, o)).toList(),
                    onChanged: _isEdit ? null : (v) => setState(() => _operation = v),
                  ),
                  const SizedBox(height: 12),
                  HoloDropdown<String>(
                    key: const ValueKey('f_difficulty'),
                    label: 'raid_form.f_difficulty'.tr(),
                    value: _difficulty,
                    items: [HoloDropdownItem('SM', 'raid_form.diff_sm'.tr()), HoloDropdownItem('HM', 'raid_form.diff_hm'.tr()), HoloDropdownItem('NiM', 'raid_form.diff_nim'.tr())],
                    onChanged: _isEdit ? null : (v) => setState(() => _difficulty = v!),
                  ),
                  const SizedBox(height: 12),
                  HoloDropdown<int>(
                    key: const ValueKey('f_size'),
                    label: 'raid_form.f_size'.tr(),
                    value: _size,
                    items: [HoloDropdownItem(8, 'raid_form.size_8'.tr()), HoloDropdownItem(16, 'raid_form.size_16'.tr())],
                    onChanged: _isEdit ? null : (v) => _applyDefaults(v!),
                  ),
                  const SizedBox(height: 12),
                  HoloDropdown<String>(
                    key: const ValueKey('f_faction'),
                    label: 'raid_form.f_faction'.tr(),
                    value: _faction,
                    items: const [HoloDropdownItem('Republic', 'Republic'), HoloDropdownItem('Empire', 'Empire')],
                    onChanged: _isEdit ? null : (v) => setState(() => _faction = v!),
                  ),
                  const SizedBox(height: 12),
                  HoloDropdown<int>(
                    label: 'raid_form.f_min_tier'.tr(),
                    value: _minTier,
                    items: List.generate(7, (i) => HoloDropdownItem(i, i == 0 ? 'common.no_tier'.tr() : 'common.tier'.tr(namedArgs: {'n': '$i'}))),
                    onChanged: (v) => setState(() => _minTier = v!),
                  ),
                  const SizedBox(height: 4),
                  SwitchListTile(
                    title: Text('raid_form.check_comp'.tr()),
                    subtitle: Text('raid_form.check_comp_sub'.tr()),
                    value: _checkComp,
                    onChanged: (v) => setState(() => _checkComp = v),
                  ),
                  if (!_isEdit)
                    SwitchListTile(
                      title: Text('raid_form.disable_mentions'.tr()),
                      subtitle: Text('raid_form.disable_mentions_sub'.tr()),
                      value: _disableMentions,
                      onChanged: (v) => setState(() => _disableMentions = v),
                    ),
                  const SizedBox(height: 16),
                  _slotsCard(),
                  const SizedBox(height: 12),
                  _pickerTile(
                    icon: Icons.calendar_today,
                    label: 'raid_form.date'.tr(),
                    value: _date.toLocal().toString().split(' ').first,
                    onTap: () async {
                      final d = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2020), lastDate: DateTime(2030));
                      if (d != null) setState(() => _date = d);
                    },
                  ),
                  const SizedBox(height: 10),
                  _pickerTile(
                    icon: Icons.access_time,
                    label: 'raid_form.time'.tr(),
                    value: _time.format(context),
                    onTap: () async {
                      final t = await showTimePicker(context: context, initialTime: _time);
                      if (t != null) setState(() => _time = t);
                    },
                  ),
                  const SizedBox(height: 12),
                  TextField(controller: _notes, decoration: InputDecoration(labelText: 'raid_form.notes'.tr()), maxLines: 2),
                  const SizedBox(height: 20),
                  if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                  HoloButton(
                    label: _isEdit ? 'common.save'.tr() : 'raid_form.title_create'.tr(),
                    loading: _saving,
                    onPressed: (_operation == null || _slotsSum != _size) ? null : _save,
                  ),
                ],
              ),
                ),
              ),
            ),
    );
  }

  Widget _slotsCard() {
    final ok = _slotsSum == _size;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: HoloPalette.glassFill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: HoloPalette.glassBorder),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('raid_form.slots_per_role'.tr(), style: const TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 2, color: HoloPalette.faint)),
          Text('$_slotsSum / $_size',
              style: TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 13, color: ok ? HoloPalette.heal : HoloPalette.red)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _slotField('TANK', HoloPalette.tank, _tank, (v) => setState(() => _tank = v))),
          Expanded(child: _slotField('HEAL', HoloPalette.heal, _heal, (v) => setState(() => _heal = v))),
          Expanded(child: _slotField('DPS', HoloPalette.dps, _dps, (v) => setState(() => _dps = v))),
        ]),
      ]),
    );
  }

  Widget _slotField(String label, Color color, int value, ValueChanged<int> onChanged) => Column(children: [
        Text(label, style: TextStyle(fontFamily: 'Aldrich', fontSize: 10, letterSpacing: 1.5, color: color)),
        const SizedBox(height: 4),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          _stepBtn(Icons.remove, value > 0 ? () => onChanged(value - 1) : null),
          SizedBox(
            width: 26,
            child: Text('$value', textAlign: TextAlign.center,
                style: const TextStyle(fontFamily: 'Orbitron', fontWeight: FontWeight.w700, fontSize: 16, color: HoloPalette.ink)),
          ),
          _stepBtn(Icons.add, () => onChanged(value + 1)),
        ]),
      ]);

  Widget _stepBtn(IconData icon, VoidCallback? onTap) => InkResponse(
        onTap: onTap,
        radius: 20,
        child: Opacity(
          opacity: onTap == null ? 0.35 : 1,
          child: Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: HoloPalette.glassBorderStrong),
            ),
            child: Icon(icon, size: 16, color: HoloPalette.dim),
          ),
        ),
      );

  Widget _pickerTile({required IconData icon, required String label, required String value, required VoidCallback onTap}) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: HoloPalette.glassFill,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: HoloPalette.glassBorder),
          ),
          child: Row(children: [
            Icon(icon, size: 18, color: HoloPalette.blue),
            const SizedBox(width: 12),
            Text('$label:', style: const TextStyle(fontFamily: 'Aldrich', fontSize: 11, letterSpacing: 2, color: HoloPalette.faint)),
            const SizedBox(width: 8),
            Expanded(child: Text(value, style: const TextStyle(fontFamily: 'Jura', fontSize: 15, color: HoloPalette.ink))),
            const Icon(Icons.chevron_right, size: 18, color: HoloPalette.faint),
          ]),
        ),
      );
}
