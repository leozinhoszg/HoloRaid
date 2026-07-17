import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/network/api_client.dart';

class AdminRepository {
  AdminRepository(this._api);
  final ApiClient _api;

  Future<List<Map<String, dynamic>>> listUsers() async {
    final res = await _api.dio.get('/users');
    return (res.data as List).map((e) => (e as Map).cast<String, dynamic>()).toList();
  }

  Future<void> promote(int id) => _api.dio.post('/users/$id/promote');
  Future<void> demote(int id) => _api.dio.post('/users/$id/demote');
}

final adminRepositoryProvider = Provider<AdminRepository>((ref) => AdminRepository(ref.watch(apiClientProvider)));
