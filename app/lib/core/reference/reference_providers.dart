import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_providers.dart';
import 'reference_models.dart';

final referenceProvider = FutureProvider<ReferenceData>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.dio.get('/reference/classes');
  return ReferenceData.fromJson((res.data as Map).cast<String, dynamic>());
});

final operationsProvider = FutureProvider<List<String>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.dio.get('/reference/operations');
  return (res.data['operations'] as List).cast<String>();
});
