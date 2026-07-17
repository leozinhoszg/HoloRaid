import 'package:holoraid/core/network/api_client.dart';
import 'package:holoraid/features/raids/raid_model.dart';
import 'package:holoraid/features/raids/raids_repository.dart';

Raid _dummy(int id) => Raid(
      id: id, codigo: 'DUMMY', operation: 'Dread Palace', difficulty: 'HM', size: 8,
      faction: 'Republic', minimumTier: 0, checkComposition: false,
      slotsTank: 2, slotsHeal: 2, slotsDps: 4, notes: null,
      startAt: DateTime.utc(2026, 8, 1, 20, 30), status: 'OPEN', createdBy: 1,
    );

class FakeRaidsRepository implements RaidsRepository {
  final List<Map<String, dynamic>> createCalls = [];
  final List<({int id, Map<String, dynamic> body})> updateCalls = [];
  Raid? getResult;

  @override
  Future<Raid> create(Map<String, dynamic> body) async { createCalls.add(body); return _dummy(1); }

  @override
  Future<Raid> update(int id, Map<String, dynamic> body) async { updateCalls.add((id: id, body: body)); return _dummy(id); }

  @override
  Future<Raid> get(int id) async => getResult ?? _dummy(id);

  // Não usados nestes testes:
  @override
  ApiClient get api => throw UnimplementedError();
  @override
  Future<List<Raid>> list({String? status}) => throw UnimplementedError();
  @override
  Future<Raid> getByCodigo(String codigo) => throw UnimplementedError();
  @override
  Future<void> remove(int id) => throw UnimplementedError();
  @override
  Future<String> join(int id, int personagemId) => throw UnimplementedError();
  @override
  Future<void> leave(int id) => throw UnimplementedError();
  @override
  Future<Raid> transition(int id, String action) => throw UnimplementedError();
  @override
  Future<Raid> duplicate(int id) => throw UnimplementedError();
}
