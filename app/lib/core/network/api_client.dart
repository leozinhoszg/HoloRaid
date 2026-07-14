import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../auth/token_storage.dart';
import '../config/app_config.dart';

class ApiClient {
  final Dio dio;
  final TokenStorage storage;
  final Future<void> Function() onSessionExpired;

  ApiClient(this.storage, {required this.onSessionExpired})
      : dio = Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl)) {
    if (kIsWeb) {
      dio.options.extra['withCredentials'] = true; // envia cookie de refresh
    }
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final at = storage.accessToken;
        if (at != null) options.headers['Authorization'] = 'Bearer $at';
        handler.next(options);
      },
      onError: (e, handler) async {
        final isAuthCall = e.requestOptions.path.startsWith('/auth/');
        if (e.response?.statusCode == 401 &&
            e.requestOptions.extra['retried'] != true &&
            !isAuthCall) {
          try {
            final refresh = await storage.readRefresh();
            final res = await dio.post('/auth/refresh',
                data: refresh != null ? {'refreshToken': refresh} : <String, dynamic>{});
            storage.accessToken = res.data['accessToken'] as String;
            if (res.data['refreshToken'] != null) {
              await storage.saveRefresh(res.data['refreshToken'] as String);
            }
            final req = e.requestOptions..extra['retried'] = true;
            req.headers['Authorization'] = 'Bearer ${storage.accessToken}';
            return handler.resolve(await dio.fetch(req));
          } catch (_) {
            await onSessionExpired();
          }
        }
        handler.next(e);
      },
    ));
  }
}
