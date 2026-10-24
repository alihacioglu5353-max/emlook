import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Belirteçler cihazın güvenli deposunda tutulur
/// (Android Keystore / iOS Keychain).
class TokenStore {
  TokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;
  static const _access = 'em_access';
  static const _refresh = 'em_refresh';

  String? _cachedAccess;

  Future<String?> get accessToken async =>
      _cachedAccess ??= await _storage.read(key: _access);

  Future<String?> get refreshToken => _storage.read(key: _refresh);

  Future<void> save({required String access, required String refresh}) async {
    _cachedAccess = access;
    await _storage.write(key: _access, value: access);
    await _storage.write(key: _refresh, value: refresh);
  }

  Future<void> clear() async {
    _cachedAccess = null;
    await _storage.delete(key: _access);
    await _storage.delete(key: _refresh);
  }
}
