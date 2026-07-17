import 'package:holoraid/core/auth/token_storage.dart';
import 'package:holoraid/core/realtime/socket_service.dart';

class FakeSocketService implements SocketService {
  @override
  Stream<RaidEvent> get events => const Stream.empty();

  @override
  void connect() {}
  @override
  void subscribeRaid(int id) {}
  @override
  void unsubscribeRaid(int id) {}
  @override
  void subscribeLobby() {}
  @override
  void unsubscribeLobby() {}
  @override
  void dispose() {}

  @override
  TokenStorage get storage => throw UnimplementedError();
}
