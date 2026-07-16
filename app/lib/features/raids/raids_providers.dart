import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import 'raid_model.dart';
import 'raids_repository.dart';

final raidsRepositoryProvider = Provider<RaidsRepository>((ref) => RaidsRepository(ref.watch(apiClientProvider)));
final raidsProvider = FutureProvider.family<List<Raid>, String?>((ref, status) => ref.watch(raidsRepositoryProvider).list(status: status));
final raidProvider = FutureProvider.family<Raid, int>((ref, id) => ref.watch(raidsRepositoryProvider).get(id));
