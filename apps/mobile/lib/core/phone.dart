/// Türkiye cep numarası yardımcıları. Asıl doğrulama API'de yapılır;
/// bunlar kullanıcıya anında geri bildirim içindir.
class TrPhone {
  /// Girişten yalnızca ulusal 10 haneyi çıkarır (5XXXXXXXXX) ya da null döner.
  static String? national(String input) {
    var digits = input.replaceAll(RegExp(r'\D'), '');
    if (digits.length == 12 && digits.startsWith('90')) {
      digits = digits.substring(2);
    } else if (digits.length == 11 && digits.startsWith('0')) {
      digits = digits.substring(1);
    }
    return RegExp(r'^5\d{9}$').hasMatch(digits) ? digits : null;
  }

  static bool isValid(String input) => national(input) != null;

  /// 0532 123 45 67 biçiminde gösterir.
  static String display(String input) {
    final n = national(input);
    if (n == null) return input;
    return '0${n.substring(0, 3)} ${n.substring(3, 6)} ${n.substring(6, 8)} ${n.substring(8)}';
  }
}
