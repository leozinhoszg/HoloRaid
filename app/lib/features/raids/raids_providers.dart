import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/realtime/socket_service.dart';
import 'raid_model.dart';
import 'raids_repository.dart';

final raidsRepositoryProvider = Provider<RaidsRepository>((ref) => RaidsRepository(ref.watch(apiClientProvider)));

final raidsListProvider = AsyncNotifierProvider.autoDispose<RaidsListNotifier, List<Raid>>(RaidsListNotifier.new);

class RaidsListNotifier extends AutoDisposeAsyncNotifier<List<Raid>> {
  @override
  Future<List<Raid>> build() async {
    final socket = ref.watch(socketServiceProvider);
    socket.subscribeLobby();
    ref.onDispose(socket.unsubscribeLobby);
    final sub = socket.events.listen(_apply);
    ref.onDispose(sub.cancel);
    return ref.read(raidsRepositoryProvider).list();
  }

  void _apply(RaidEvent e) {
    final current = state.valueOrNull ?? const <Raid>[];
    if (e.name == 'raidRemoved') {
      state = AsyncData(current.where((r) => r.id != e.removedId).toList());
      return;
    }
    final raid = e.raid;
    if (raid == null) return;
    if (e.name == 'raidCreated') {
      state = AsyncData([raid, ...current.where((r) => r.id != raid.id)]);
    } else {
      state = AsyncData(current.map((r) => r.id == raid.id ? raid : r).toList());
    }
  }
}

final raidDetailProvider = AsyncNotifierProvider.autoDispose.family<RaidDetailNotifier, Raid, int>(RaidDetailNotifier.new);

class RaidDetailNotifier extends AutoDisposeFamilyAsyncNotifier<Raid, int> {
  @override
  Future<Raid> build(int arg) async {
    final socket = ref.watch(socketServiceProvider);
    socket.subscribeRaid(arg);
    ref.onDispose(() => socket.unsubscribeRaid(arg));
    final sub = socket.events.listen((e) {
      if (e.name == 'raidRemoved' && e.removedId == arg) {
        state = AsyncError('Raid removida', StackTrace.current);
        return;
      }
      final raid = e.raid;
      if (raid != null && raid.id == arg) state = AsyncData(raid);
    });
    ref.onDispose(sub.cancel);
    return ref.read(raidsRepositoryProvider).get(arg);
  }
}
