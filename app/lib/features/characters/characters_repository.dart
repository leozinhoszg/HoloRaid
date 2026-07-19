import '../../core/network/api_client.dart';
import 'character_model.dart';

class CharactersRepository {
  final ApiClient api;
  CharactersRepository(this.api);

  Future<List<Character>> list() async {
    final res = await api.dio.get('/characters');
    return (res.data as List).map((e) => Character.fromJson((e as Map).cast<String, dynamic>())).toList();
  }

  Future<Character> get(int id) async {
    final res = await api.dio.get('/characters/$id');
    return Character.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<Character> create(Map<String, dynamic> body) async {
    final res = await api.dio.post('/characters', data: body);
    return Character.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<Character> update(int id, Map<String, dynamic> body) async {
    final res = await api.dio.patch('/characters/$id', data: body);
    return Character.fromJson((res.data as Map).cast<String, dynamic>());
  }

  Future<void> remove(int id) async => api.dio.delete('/characters/$id');
}
