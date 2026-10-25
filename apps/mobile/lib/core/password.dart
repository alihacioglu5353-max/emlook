/// Parola kuralları (API'deki `passwordProblem` ile aynı). Asıl denetim sunucuda yapılır.
class PasswordRules {
  static bool longEnough(String p) => p.length >= 8;
  static bool hasLetter(String p) => RegExp(r'\p{L}', unicode: true).hasMatch(p);
  static bool hasDigit(String p) => RegExp(r'\d').hasMatch(p);

  /// Sorun yoksa null, varsa kullanıcıya gösterilecek ilk sorun.
  static String? problem(String p) {
    if (!longEnough(p)) return 'Parola en az 8 karakter olmalı';
    if (p.length > 128) return 'Parola en fazla 128 karakter olabilir';
    if (!hasLetter(p) || !hasDigit(p)) return 'Parola en az bir harf ve bir rakam içermeli';
    return null;
  }

  static bool isEmail(String v) => RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(v.trim());
}
