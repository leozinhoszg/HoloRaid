import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:holoraid/core/auth/auth_providers.dart';
import 'package:holoraid/core/auth/token_storage.dart';
import 'package:holoraid/core/network/api_client.dart';
import 'package:holoraid/features/profile/me_progression_screen.dart';

/// Adapter dio que responde ao catálogo/estado da tela de progressão e captura
/// os PUT de save, sem rede real.
class StubAdapter implements HttpClientAdapter {
  StubAdapter(this.catalog, this.mine);
  final List<Map<String, dynamic>> catalog;
  final List<Map<String, dynamic>> mine;
  final List<RequestOptions> puts = [];

  @override
  Future<ResponseBody> fetch(
      RequestOptions options, Stream<Uint8List>? requestStream, Future<dynamic>? cancelFuture) async {
    Object body = <String, dynamic>{};
    if (options.method == 'GET' && options.path == '/reference/bosses') {
      body = {'bosses': catalog};
    } else if (options.method == 'GET' && options.path == '/me/bosses') {
      body = mine;
    } else if (options.method == 'PUT' && options.path == '/me/bosses') {
      puts.add(options);
      body = {'ok': true};
    }
    return ResponseBody.fromString(
      json.encode(body),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Pumpa a [MeProgressionScreen] real com a API stubada. Requer
/// `initTestLocalization()` no setUpAll (a tela usa `.tr()`).
Future<StubAdapter> pumpProgression(
  WidgetTester tester, {
  required List<Map<String, dynamic>> catalog,
  List<Map<String, dynamic>> mine = const [],
}) async {
  tester.view.physicalSize = const Size(1200, 3200);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  final client = ApiClient(MemoryTokenStorage(), onSessionExpired: () async {});
  final adapter = StubAdapter(catalog, mine);
  client.dio.httpClientAdapter = adapter;

  await tester.pumpWidget(
    ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(client)],
      child: const MaterialApp(home: Scaffold(body: MeProgressionScreen())),
    ),
  );
  await tester.pumpAndSettle();
  return adapter;
}
