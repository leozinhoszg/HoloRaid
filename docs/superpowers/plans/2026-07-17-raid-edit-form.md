# Editar raid na UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela de edição de raid reusando o `RaidFormScreen`, cobrindo os campos que o `PATCH /raids/:id` aceita, com os imutáveis read-only.

**Architecture:** 100% Flutter. `RaidFormScreen` ganha um `editRaidId?`: `null` = criar (intacto), preenchido = editar (pré-preenche via `raidsRepository.get`, trava operation/difficulty/size/faction, salva via `update`). Botão "Editar" no `raid_detail` (líder/admin, só OPEN). Backend intacto.

**Tech Stack:** Flutter (Riverpod, go_router, Dio). Nenhuma mudança de backend.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-raid-edit-form-design.md`.
- **NENHUMA mudança de backend** — `PATCH /raids/:id` + `raidUpdateSchema` + `raidService.update` já existem e são testados (#3).
- **Editáveis:** `minimum_tier`, `check_composition`, `slots_*`, `notes`, `start_at`. **Imutáveis** (read-only em edição): `operation`, `difficulty`, `size`, `faction`. O payload de edição **omite** os imutáveis **e** `disable_mentions` (não está no `raidUpdateSchema`).
- **Botão "Editar" só quando `raid.status == 'OPEN'`** e dentro do bloco líder/admin.
- **Criar (`/raids/new`) fica idêntico** — o modo default não muda.
- **Regressão:** os **211 testes de backend seguem verdes SEM MUDANÇA**.
- **Verificação (a pedido: "verificar todos os erros"):** `flutter analyze` limpo **+** smoke real contra o MySQL exercitando `raidService.update` nos 4 caminhos (válido, slots≠size, slots<confirmados, não-OPEN).
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Flutter em `app/`; smoke em `backend/`. `flutter analyze` → `No issues found!`.

---

### Task 1: Parametrizar o `RaidFormScreen` (criar ↔ editar)

**Files:**
- Modify (substituir inteiro): `app/lib/features/raids/raid_form_screen.dart`

**Interfaces:**
- Consumes: `raidsRepository` (`get`/`create`/`update`), `raidsListProvider`, `raidDetailProvider`, `operationsProvider`.
- Produces: `RaidFormScreen({ int? editRaidId })`.

- [ ] **Step 1: Substituir o arquivo inteiro**

Substitua **todo** o conteúdo de `app/lib/features/raids/raid_form_screen.dart` por:

```dart
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
```

> Mudanças-chave vs. o original: `editRaidId` + `_isEdit`; `_prefill` (busca a raid e preenche);
> os 4 dropdowns imutáveis com `onChanged: _isEdit ? null : ...` (desabilitados em edição);
> o switch "Disable mentions" só em criação (`if (!_isEdit)`); `_save` ramifica create/update;
> títulos/botão condicionais; guard de loading no build.

- [ ] **Step 2: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add app/lib/features/raids/raid_form_screen.dart
git commit -m "feat(app): RaidFormScreen parametrizado para criar ou editar"
```

---

### Task 2: Rota `/raids/:id/edit` + botão "Editar"

**Files:**
- Modify: `app/lib/core/router/app_router.dart`
- Modify: `app/lib/features/raids/raid_detail_screen.dart`

**Interfaces:**
- Consumes: `RaidFormScreen(editRaidId:)` (Task 1).
- Produces: rota `/raids/:id/edit`; botão "Editar" no bloco de gestão.

- [ ] **Step 1: Registrar a rota**

Em `app/lib/core/router/app_router.dart`, adicione (depois de `/raids/new`):

```dart
      GoRoute(path: '/raids/:id/edit', builder: (_, state) => RaidFormScreen(editRaidId: int.parse(state.pathParameters['id']!))),
```

> `RaidFormScreen` já está importado no arquivo (usado em `/raids/new`). Sem conflito de rota:
> `/raids/new` (literal) e `/raids/:id/edit` (3 segmentos) são distintos de `/raids/:id`.

- [ ] **Step 2: Botão "Editar" no raid detail**

Em `app/lib/features/raids/raid_detail_screen.dart`, no bloco `if (iAmLeader || iAmAdmin) Wrap(...)`, adicione o botão **Editar** como **primeiro** filho (só quando OPEN):

```dart
              if (iAmLeader || iAmAdmin) Wrap(spacing: 8, children: [
                if (raid.status == 'OPEN') TextButton(onPressed: () => context.push('/raids/${raid.id}/edit'), child: const Text('Editar')),
                if (raid.status == 'OPEN') TextButton(onPressed: () => _transition(context, ref, 'start'), child: const Text('Iniciar')),
                if (raid.status == 'OPEN' || raid.status == 'RUNNING') TextButton(onPressed: () => _transition(context, ref, 'finish'), child: const Text('Encerrar')),
                if (raid.status == 'OPEN' || raid.status == 'RUNNING') TextButton(onPressed: () => _transition(context, ref, 'cancel'), child: const Text('Cancelar')),
                TextButton(onPressed: () => _duplicate(context, ref), child: const Text('Duplicar')),
                TextButton(onPressed: () => _delete(context, ref), style: TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error), child: const Text('Excluir')),
              ]),
```

(`context.push` já está disponível — o `go_router` foi importado no Painel Admin.)

- [ ] **Step 3: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 4: Commit**

```bash
git add app/lib/core/router/app_router.dart app/lib/features/raids/raid_detail_screen.dart
git commit -m "feat(app): rota /raids/:id/edit + botao Editar (lider/admin, so OPEN)"
```

---

### Task 3: Verificação final — flutter analyze + smoke do contrato (todos os erros)

**Files:** nenhum (verificação).

- [ ] **Step 1: Backend intacto**

Run: `cd backend && npm test 2>&1 | grep -E "Tests |Test Files"`
Expected: **211 passed**. Confirme que nada de backend mudou:
Run: `cd /d/HoloRaid && git diff master --stat -- backend/`
Expected: **vazio**.

- [ ] **Step 2: Flutter analyze**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 3: Smoke real do contrato de edição (os 4 caminhos, incl. TODOS os erros)**

Exercita `raidService.update` contra o **MySQL real** com o payload que o form envia:

```bash
cd backend && cat > smoke.tmp.ts <<'EOF'
import 'dotenv/config';
import { db } from './src/db/db';
import { createUserRepo } from './src/db/repositories/userRepo';
import { createPersonagemRepo } from './src/db/repositories/personagemRepo';
import { createRaidRepo } from './src/db/repositories/raidRepo';
import { createRaidPlayerRepo } from './src/db/repositories/raidPlayerRepo';
import { createRaidService } from './src/modules/raids/raids.service';

const throws = async (fn: () => Promise<unknown>, re: RegExp) => {
  try { await fn(); return false; } catch (e: any) { return re.test(e.constructor?.name || '') || re.test(e.message || ''); }
};

(async () => {
  const userRepo = createUserRepo(db);
  const personagemRepo = createPersonagemRepo(db);
  const raidRepo = createRaidRepo(db);
  const raidPlayerRepo = createRaidPlayerRepo(db);
  const svc = createRaidService({ raidRepo, raidPlayerRepo });

  const u = await userRepo.upsertByDiscordId({ discord_id: 'EDIT8', username: 'EDIT8', nickname: null, avatar: null, email: null, role: 'user' });
  const actor = { sub: u.id, role: 'user' as const };
  const ch = await personagemRepo.create({ usuario_id: u.id, nome: 'E', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 } as any);

  const mk = () => raidRepo.create({ codigo: 'EDIT8' + Math.floor(Math.random() * 1e6), operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date(Date.now() + 3600_000), created_by: u.id } as any);
  const ids: number[] = [];

  // 1. edição válida
  const r1 = await mk(); ids.push(r1.id);
  const upd = await svc.update(actor, r1.id, { minimum_tier: 3, slots_tank: 3, slots_heal: 2, slots_dps: 3, notes: 'editado', start_at: new Date(Date.now() + 7200_000) });
  const ok1 = upd.minimum_tier === 3 && upd.slots_tank === 3 && upd.notes === 'editado';
  console.log('--> 1 edicao valida:', ok1, '(esperado true)');

  // 2. slots != size
  const r2 = await mk(); ids.push(r2.id);
  const ok2 = await throws(() => svc.update(actor, r2.id, { slots_tank: 3, slots_heal: 3, slots_dps: 3 }), /Validation|somar/i);
  console.log('--> 2 slots != size -> ValidationError:', ok2, '(esperado true)');

  // 3. slots abaixo dos confirmados (2 tanks confirmados, tenta 1)
  const r3 = await mk(); ids.push(r3.id);
  const u2 = await userRepo.upsertByDiscordId({ discord_id: 'EDIT8b', username: 'EDIT8b', nickname: null, avatar: null, email: null, role: 'user' });
  const ch2 = await personagemRepo.create({ usuario_id: u2.id, nome: 'E2', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 } as any);
  await raidPlayerRepo.create({ raid_id: r3.id, usuario_id: u.id, personagem_id: ch.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
  await raidPlayerRepo.create({ raid_id: r3.id, usuario_id: u2.id, personagem_id: ch2.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
  const ok3 = await throws(() => svc.update(actor, r3.id, { slots_tank: 1, slots_heal: 3, slots_dps: 4 }), /Validation|confirmados/i);
  console.log('--> 3 slots < confirmados -> ValidationError:', ok3, '(esperado true)');

  // 4. raid nao-OPEN
  const r4 = await mk(); ids.push(r4.id);
  await svc.transition(actor, r4.id, 'cancel');
  const ok4 = await throws(() => svc.update(actor, r4.id, { minimum_tier: 2 }), /Conflict|OPEN/i);
  console.log('--> 4 nao-OPEN -> ConflictError:', ok4, '(esperado true)');

  const ok = ok1 && ok2 && ok3 && ok4;

  for (const id of ids) await raidRepo.delete(id);
  await db.deleteFrom('usuarios').where('id', 'in', [u.id, u2.id]).execute();
  console.log(ok ? '\n=== SMOKE OK ===' : '\n=== SMOKE FALHOU ===');
  await db.destroy();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FALHOU:', e.code || '', e.sqlMessage || e.message); process.exit(1); });
EOF
npx tsx smoke.tmp.ts; rm -f smoke.tmp.ts
```
Expected: os 4 `true` e `=== SMOKE OK ===`. Prova o contrato de edição (sucesso + os 3 erros) que a tela depende.

> **Nota:** `Math.random()` é permitido aqui (script `tsx` normal, fora do runtime de Workflow).

- [ ] **Step 4: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "chore(raids): verificacao da edicao de raid (analyze + smoke do contrato)"
```

---

## Notas de execução

- **Branch:** `feat/raid-edit-form`, merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** 1 → 2 → 3.
- **Fatia UI-only:** sem TDD de backend. A verificação é `flutter analyze` + o smoke reforçado do contrato; o smoke manual da UI depende de app rodando (reporte como pendente se não houver ambiente).
- **Não toque em backend.**
