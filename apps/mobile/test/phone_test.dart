import 'package:emlook/core/phone.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('TrPhone', () {
    test('farklı yazımları ulusal biçime çevirir', () {
      for (final input in ['0532 123 45 67', '5321234567', '+90 532 123 45 67', '905321234567']) {
        expect(TrPhone.national(input), '5321234567', reason: input);
      }
    });

    test('sabit hat ve eksik numaraları reddeder', () {
      for (final input in ['0212 123 45 67', '532 123', '', '0']) {
        expect(TrPhone.isValid(input), isFalse, reason: input);
      }
    });

    test('okunur biçimde gösterir', () {
      expect(TrPhone.display('5321234567'), '0532 123 45 67');
    });
  });
}
