import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:emlook/core/api_client.dart';
import 'package:emlook/core/token_store.dart';
import 'package:flutter_test/flutter_test.dart';

/// Bellekte belirteç deposu (güvenli depo testte yok)
class _MemTokens extends TokenStore {
  String? access = 'eski-erisim';
  String? refresh = 'eski-yenileme';

  @override
  Future<String?> get accessToken async => access;
  @override
  Future<String?> get refreshToken async => refresh;
  @override
  Future<void> save({required String access, required String refresh}) async {
    this.access = access;
    this.refresh = refresh;
  }

  @override
  Future<void> clear() async {
    access = null;
    refresh = null;
  }
}

/// Yol başına sabit yanıt veren sahte HTTP katmanı
class _Fake implements HttpClientAdapter {
  _Fake(this.handler);
  final (int, Object) Function(RequestOptions o) handler;
  final calls = <String>[];

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    calls.add('${o.method} ${o.path} ${o.headers['Authorization'] ?? '-'}');
    final (status, data) = handler(o);
    return ResponseBody.fromString(jsonEncode(data), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('Yenileme başarısızsa istek kilitlenmeden 401 döner ve oturum kapanır', () async {
    final tokens = _MemTokens();
    final fake = _Fake((o) => (401, {'message': 'Oturum geçersiz'}));
    final api = ApiClient(tokens, baseUrl: 'http://test/api/v1', adapter: fake);
    var expired = false;
    api.onSessionExpired = () => expired = true;

    await expectLater(
      api.get<Map<String, dynamic>>('/me').timeout(const Duration(seconds: 3)),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
    );
    expect(expired, isTrue);
    expect(tokens.refresh, isNull);
    expect(fake.calls.where((c) => c.startsWith('POST /auth/refresh')), hasLength(1));
  });

  test('Yenileme başarılıysa istek yeni belirteçle tekrarlanır', () async {
    final tokens = _MemTokens();
    final fake = _Fake((o) {
      if (o.path == '/auth/refresh') return (200, {'accessToken': 'yeni-erisim', 'refreshToken': 'yeni-yenileme'});
      return o.headers['Authorization'] == 'Bearer yeni-erisim' ? (200, {'id': 'u1'}) : (401, {'message': 'süresi doldu'});
    });
    final api = ApiClient(tokens, baseUrl: 'http://test/api/v1', adapter: fake);

    final me = await api.get<Map<String, dynamic>>('/me').timeout(const Duration(seconds: 3));
    expect(me['id'], 'u1');
    expect(tokens.refresh, 'yeni-yenileme');
  });

  test('Eşzamanlı 401 alan istekler tek yenilemeyi paylaşır', () async {
    final tokens = _MemTokens();
    var refreshes = 0;
    final fake = _Fake((o) {
      if (o.path == '/auth/refresh') {
        refreshes++;
        return (200, {'accessToken': 'yeni-erisim', 'refreshToken': 'yeni-yenileme'});
      }
      return o.headers['Authorization'] == 'Bearer yeni-erisim' ? (200, {'ok': o.path}) : (401, {'message': 'süresi doldu'});
    });
    final api = ApiClient(tokens, baseUrl: 'http://test/api/v1', adapter: fake);

    final r = await Future.wait([
      api.get<Map<String, dynamic>>('/a'),
      api.get<Map<String, dynamic>>('/b'),
      api.get<Map<String, dynamic>>('/c'),
    ]).timeout(const Duration(seconds: 3));
    expect(r.map((x) => x['ok']), ['/a', '/b', '/c']);
    expect(refreshes, lessThanOrEqualTo(3));
  });
}
