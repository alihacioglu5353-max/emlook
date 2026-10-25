import 'package:emlook/core/password.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Parola kuralları API ile aynı', () {
    expect(PasswordRules.problem('kisa1'), 'Parola en az 8 karakter olmalı');
    expect(PasswordRules.problem('sadeceharf'), 'Parola en az bir harf ve bir rakam içermeli');
    expect(PasswordRules.problem('12345678'), 'Parola en az bir harf ve bir rakam içermeli');
    expect(PasswordRules.problem('Demo2026'), isNull);
    expect(PasswordRules.problem('şifre2026'), isNull);
  });

  test('E-posta biçimi', () {
    expect(PasswordRules.isEmail(' ayse@demo.emlook.app '), isTrue);
    expect(PasswordRules.isEmail('ayse@demo'), isFalse);
    expect(PasswordRules.isEmail('ayse demo@x.com'), isFalse);
  });
}
