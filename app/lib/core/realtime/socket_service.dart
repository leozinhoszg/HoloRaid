import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../auth/auth_providers.dart';
import '../auth/token_storage.dart';
import '../config/app_config.dart';
import '../../features/raids/raid_model.dart';

class RaidEvent {
  final String name;
  final Raid? raid;
  final int? removedId;
  RaidEvent(this.name, {this.raid, this.removedId});
}

const _raidEvents = ['playerJoined', 'playerLeft', 'raidUpdated', 'raidStarted', 'raidFinished', 'raidCancelled', 'raidCreated'];

class SocketService {
  final TokenStorage storage;
  io.Socket? _socket;
  final _controller = StreamController<RaidEvent>.broadcast();
  final Set<int> _raidRooms = {};
  bool _lobby = false;

  SocketService(this.storage);

  Stream<RaidEvent> get events => _controller.stream;

  void connect() {
    if (_socket != null) return;
    final s = io.io(
      AppConfig.apiBaseUrl,
      io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().setAuth({'token': storage.accessToken}).build(),
    );
    _socket = s;
    for (final name in _raidEvents) {
      s.on(name, (data) {
        final raw = (data as Map)['raid'];
        if (raw != null) _controller.add(RaidEvent(name, raid: Raid.fromJson((raw as Map).cast<String, dynamic>())));
      });
    }
    s.on('raidRemoved', (data) {
      final id = (data as Map)['id'];
      if (id is int) _controller.add(RaidEvent('raidRemoved', removedId: id));
    });
    s.onConnect((_) => _resubscribe());
    s.onReconnectAttempt((_) => s.auth = {'token': storage.accessToken});
    s.connect();
  }

  void _resubscribe() {
    if (_lobby) _socket?.emit('subscribe:lobby');
    for (final id in _raidRooms) {
      _socket?.emit('subscribe:raid', {'id': id});
    }
  }

  void subscribeRaid(int id) {
    _raidRooms.add(id);
    _socket?.emit('subscribe:raid', {'id': id});
  }

  void unsubscribeRaid(int id) {
    _raidRooms.remove(id);
    _socket?.emit('unsubscribe:raid', {'id': id});
  }

  void subscribeLobby() {
    _lobby = true;
    _socket?.emit('subscribe:lobby');
  }

  void unsubscribeLobby() {
    _lobby = false;
    _socket?.emit('unsubscribe:lobby');
  }

  void dispose() {
    _socket?.dispose();
    _controller.close();
  }
}

final socketServiceProvider = Provider<SocketService>((ref) {
  final s = SocketService(ref.watch(tokenStorageProvider))..connect();
  ref.onDispose(s.dispose);
  return s;
});
