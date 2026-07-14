import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class TokenStorage {
  String? accessToken;
  Future<void> saveRefresh(String? token);
  Future<String?> readRefresh();
  Future<void> clear();

  factory TokenStorage.platform() =>
      kIsWeb ? MemoryTokenStorage() : SecureTokenStorage();
}

class MemoryTokenStorage implements TokenStorage {
  @override
  String? accessToken;
  // Na Web o refresh vive em cookie httpOnly — o app não o manuseia.
  @override
  Future<void> saveRefresh(String? token) async {}
  @override
  Future<String?> readRefresh() async => null;
  @override
  Future<void> clear() async => accessToken = null;
}

class SecureTokenStorage implements TokenStorage {
  final _storage = const FlutterSecureStorage();
  static const _key = 'rs_refresh';
  @override
  String? accessToken;
  @override
  Future<void> saveRefresh(String? token) async {
    if (token == null) return _storage.delete(key: _key);
    await _storage.write(key: _key, value: token);
  }
  @override
  Future<String?> readRefresh() => _storage.read(key: _key);
  @override
  Future<void> clear() async {
    accessToken = null;
    await _storage.delete(key: _key);
  }
}
