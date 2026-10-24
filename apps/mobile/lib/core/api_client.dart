import 'dart:async';

import 'package:dio/dio.dart';

import 'config.dart';
import 'token_store.dart';

/// API'den dönen hata. [message] kullanıcıya gösterilebilir Türkçe metindir.
class ApiException implements Exception {
  ApiException(this.message, {this.status, this.code, this.data});

  final String message;
  final int? status;
  final String? code;
  final Map<String, dynamic>? data;

  @override
  String toString() => message;

  static ApiException from(Object error) {
    if (error is ApiException) return error;
    if (error is DioException) {
      final res = error.response;
      if (res == null) {
        return ApiException('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.');
      }
      final body = res.data;
      if (body is Map<String, dynamic>) {
        final raw = body['message'];
        final msg = raw is List ? raw.join(' · ') : raw?.toString();
        return ApiException(
          msg ?? 'Bir şeyler ters gitti',
          status: res.statusCode,
          code: body['code']?.toString(),
          data: body,
        );
      }
      return ApiException('Bir şeyler ters gitti', status: res.statusCode);
    }
    return ApiException('Beklenmeyen bir hata oluştu');
  }
}

/// Oturum sona erdiğinde (yenileme başarısız) çağrılır.
typedef SessionExpired = void Function();

/// Erişim belirtecini ekleyen, süresi dolduğunda bir kez yenileyip isteği
/// tekrarlayan HTTP istemcisi.
class ApiClient {
  ApiClient(this._tokens, {String? baseUrl})
      : dio = Dio(BaseOptions(
          baseUrl: baseUrl ?? AppConfig.apiUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 30),
          contentType: Headers.jsonContentType,
        )) {
    dio.interceptors.add(QueuedInterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _tokens.accessToken;
        if (token != null && options.extra['auth'] != false) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        final req = error.requestOptions;
        final retriable = error.response?.statusCode == 401 &&
            req.extra['auth'] != false &&
            req.extra['retried'] != true &&
            req.data is! FormData; // akış gövdeleri tekrar gönderilemez
        if (!retriable) return handler.next(error);

        if (await _refresh()) {
          req.extra['retried'] = true;
          req.headers['Authorization'] = 'Bearer ${await _tokens.accessToken}';
          try {
            return handler.resolve(await dio.fetch(req));
          } on DioException catch (e) {
            return handler.next(e);
          }
        }
        await _tokens.clear();
        onSessionExpired?.call();
        handler.next(error);
      },
    ));
  }

  final TokenStore _tokens;
  final Dio dio;
  SessionExpired? onSessionExpired;
  Future<bool>? _refreshing;

  Future<bool> _refresh() => _refreshing ??= () async {
        try {
          final refresh = await _tokens.refreshToken;
          if (refresh == null) return false;
          final res = await dio.post<Map<String, dynamic>>(
            '/auth/refresh',
            data: {'refreshToken': refresh},
            options: Options(extra: {'auth': false}),
          );
          await _tokens.save(
            access: res.data!['accessToken'] as String,
            refresh: res.data!['refreshToken'] as String,
          );
          return true;
        } catch (_) {
          return false;
        } finally {
          _refreshing = null;
        }
      }();

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _wrap(() => dio.get<T>(path, queryParameters: query));

  Future<T> post<T>(String path, {Object? data, bool auth = true}) =>
      _wrap(() => dio.post<T>(path, data: data, options: Options(extra: {'auth': auth})));

  Future<T> patch<T>(String path, {Object? data}) =>
      _wrap(() => dio.patch<T>(path, data: data));

  Future<T> put<T>(String path, {Object? data}) => _wrap(() => dio.put<T>(path, data: data));

  Future<T> delete<T>(String path) => _wrap(() => dio.delete<T>(path));

  Future<T> _wrap<T>(Future<Response<T>> Function() call) async {
    try {
      return (await call()).data as T;
    } catch (e) {
      throw ApiException.from(e);
    }
  }
}
