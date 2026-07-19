import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import 'my_raid_model.dart';

final meProvider = FutureProvider<Map<String, dynamic>>(
    (ref) => ref.read(authServiceProvider).loadMe());

final myRaidsProvider = FutureProvider<List<MyRaid>>((ref) async {
  final res = await ref.read(apiClientProvider).dio.get('/me/raids');
  return (res.data as List)
      .map((e) => MyRaid.fromJson((e as Map).cast<String, dynamic>()))
      .toList();
});
