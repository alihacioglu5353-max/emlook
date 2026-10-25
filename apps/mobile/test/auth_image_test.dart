import 'dart:typed_data';

import 'package:emlook/widgets/auth_image.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Görsel önbelleği yüklemeyi tamamlar, aynı yolu bir kez indirir', () async {
    var calls = 0;
    Future<Uint8List> fetch() async {
      calls++;
      await Future<void>.delayed(const Duration(milliseconds: 10));
      return Uint8List.fromList([1, 2, 3]);
    }

    const path = '/listings/l1/photos/p1';
    // Eşzamanlı iki istek aynı indirmeyi paylaşır ve ikisi de tamamlanır.
    final results = await Future.wait([
      authImageCache.loadWith(path, fetch),
      authImageCache.loadWith(path, fetch),
    ]).timeout(const Duration(seconds: 2));
    expect(results.every((b) => b.length == 3), isTrue);
    expect(calls, 1);
    expect(authImageCache.peek(path), isNotNull);

    // Önbellekten gelir, yeniden indirilmez.
    await authImageCache.loadWith(path, fetch);
    expect(calls, 1);
  });

  test('Başarısız yükleme hatayı iletir ve tekrar denenebilir', () async {
    const path = '/listings/l1/photos/hata';
    await expectLater(
      authImageCache.loadWith(path, () async => throw StateError('ağ yok')).timeout(const Duration(seconds: 2)),
      throwsStateError,
    );
    final b = await authImageCache.loadWith(path, () async => Uint8List(4)).timeout(const Duration(seconds: 2));
    expect(b.length, 4);
  });
}
