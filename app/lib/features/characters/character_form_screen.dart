import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/reference/reference_providers.dart';
import '../../core/reference/reference_models.dart';
import '../../core/ui/holo_button.dart';
import '../../core/ui/holo_dropdown.dart';
import 'characters_providers.dart';

class CharacterFormScreen extends ConsumerStatefulWidget {
  const CharacterFormScreen({super.key});
  @override
  ConsumerState<CharacterFormScreen> createState() => _CharacterFormScreenState();
}

class _CharacterFormScreenState extends ConsumerState<CharacterFormScreen> {
  final _nome = TextEditingController();
  final _itemLevel = TextEditingController(text: '340');
  String? _faccao, _classe, _disciplina, _role;
  bool _saving = false;
  String? _error;

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(charactersRepositoryProvider).create({
        'nome': _nome.text.trim(),
        'faccao': _faccao,
        'classe': _classe,
        if (_disciplina != null) 'especializacao': _disciplina,
        'role': _role,
        'item_level': int.tryParse(_itemLevel.text) ?? 0,
      });
      ref.invalidate(charactersProvider);
      if (mounted) context.pop();
    } on DioException catch (e) {
      setState(() => _error =
          e.response?.statusCode == 422 ? 'Combinação inválida de classe/role/disciplina.' : 'Falha: ${e.message}');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final refData = ref.watch(referenceProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Novo Personagem')),
      body: refData.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Erro: $e')),
        data: (data) {
          final styles = _faccao == null ? <CombatStyle>[] : data.stylesOfFaction(_faccao!);
          final style = _classe == null ? null : data.combatStyles.firstWhere((c) => c.name == _classe);
          final discs = _classe == null ? <Discipline>[] : data.disciplinesOfStyle(_classe!);
          final roleOptions = style?.allowedRoles ?? <String>[];
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              TextField(
                controller: _nome,
                decoration: const InputDecoration(labelText: 'Nome'),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              HoloDropdown<String>(
                label: 'Facção',
                value: _faccao,
                items: data.factions.map((f) => HoloDropdownItem(f, f)).toList(),
                onChanged: (v) => setState(() {
                  _faccao = v;
                  _classe = null;
                  _disciplina = null;
                  _role = null;
                }),
              ),
              const SizedBox(height: 12),
              HoloDropdown<String>(
                label: 'Combat Style',
                value: _classe,
                items: styles.map((c) => HoloDropdownItem(c.name, c.name)).toList(),
                onChanged: _faccao == null
                    ? null
                    : (v) => setState(() {
                          _classe = v;
                          _disciplina = null;
                          _role = null;
                        }),
              ),
              const SizedBox(height: 12),
              HoloDropdown<String?>(
                label: 'Disciplina (opcional)',
                value: _disciplina,
                items: [
                  const HoloDropdownItem<String?>(null, '— nenhuma —'),
                  ...discs.map((d) => HoloDropdownItem<String?>(d.name, '${d.name} (${d.role})')),
                ],
                onChanged: _classe == null
                    ? null
                    : (v) => setState(() {
                          _disciplina = v;
                          if (v != null) _role = discs.firstWhere((d) => d.name == v).role; // role auto pela disciplina
                        }),
              ),
              const SizedBox(height: 12),
              HoloDropdown<String>(
                label: 'Role',
                value: _role,
                items: roleOptions.map((r) => HoloDropdownItem(r, r)).toList(),
                onChanged: (_classe == null || _disciplina != null) ? null : (v) => setState(() => _role = v),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _itemLevel,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Item Level'),
              ),
              const SizedBox(height: 20),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ),
              HoloButton(
                label: 'Criar personagem',
                loading: _saving,
                onPressed: (_nome.text.trim().isEmpty || _faccao == null || _classe == null || _role == null)
                    ? null
                    : _save,
              ),
            ],
          ),
            ),
          );
        },
      ),
    );
  }
}
