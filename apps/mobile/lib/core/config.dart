/// API adresi derleme anında verilir:
///   flutter run --dart-define=API_URL=https://api.emlook.com.tr/api/v1
/// Varsayılan değer Android emülatöründen bilgisayardaki yerel API'ye gider
/// (10.0.2.2 emülatörün "localhost" karşılığıdır).
class AppConfig {
  static const apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1',
  );
}
