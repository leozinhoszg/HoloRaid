import '../../core/network/api_client.dart';
import 'raid_model.dart';

class RaidsRepository {
  final ApiClient api;
  RaidsRepository(this.api);

  Future<List<Raid>> list({String? status}) async {
    final qp = <String, dynamic>{};
    if (status != null) qp['status'] = status;
    final res = await api.dio.get('/raids', queryParameters: qp);
    return (res.data as List).map((e) => Raid.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  Future<Raid> get(int id) async => Raid.fromJson(((await api.dio.get('/raids/$id')).data as Map).cast<String, dynamic>());
  Future<Raid> getByCodigo(String codigo) async => Raid.fromJson(((await api.dio.get('/raids/code/$codigo')).data as Map).cast<String, dynamic>());
  Future<Raid> create(Map<String, dynamic> body) async => Raid.fromJson(((await api.dio.post('/raids', data: body)).data as Map).cast<String, dynamic>());
  Future<Raid> update(int id, Map<String, dynamic> body) async => Raid.fromJson(((await api.dio.patch('/raids/$id', data: body)).data as Map).cast<String, dynamic>());
  Future<void> remove(int id) async => api.dio.delete('/raids/$id');
  Future<String> join(int id, int personagemId) async {
    final res = await api.dio.post('/raids/$id/join', data: {'personagem_id': personagemId});
    return res.data['status'] as String;
  }
  Future<void> leave(int id) async => api.dio.delete('/raids/$id/leave');
  Future<Raid> transition(int id, String action) async => Raid.fromJson(((await api.dio.post('/raids/$id/$action')).data as Map).cast<String, dynamic>());
  Future<Raid> duplicate(int id) async => Raid.fromJson(((await api.dio.post('/raids/$id/duplicate')).data as Map).cast<String, dynamic>());
}
