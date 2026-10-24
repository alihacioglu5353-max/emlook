import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/locations.dart';
import '../core/models.dart';
import '../core/token_store.dart';
import '../widgets/profile_avatar.dart';

enum SessionState { unknown, signedOut, signedIn }

/// Oturum durumu ve kimlik işlemleri. Yönlendirici bu nesneyi dinler.
class Session extends ChangeNotifier {
  Session({TokenStore? tokens, ApiClient? api})
      : tokens = tokens ?? TokenStore() {
    this.api = api ?? ApiClient(this.tokens);
    this.api.onSessionExpired = _expired;
  }

  final TokenStore tokens;
  late final ApiClient api;
  late final Locations locations = Locations(api);

  SessionState state = SessionState.unknown;
  Me? me;

  /// Kod ekranına geçerken girilen numara
  String? pendingPhone;

  /// Okunmamış bildirim sayısı (ana sayfadaki zil)
  int unreadCount = 0;

  /// Okunmamış mesaj sayısı (alt menüdeki rozet)
  int unreadMessages = 0;

  /// Uygulama açılışında kayıtlı oturumu doğrular.
  Future<void> bootstrap() async {
    if (await tokens.refreshToken == null) {
      _set(SessionState.signedOut);
      return;
    }
    try {
      await reloadMe();
    } on ApiException catch (e) {
      // Ağ hatasında oturumu silmeyiz; yalnızca yetki hatasında çıkış yapılır.
      if (e.status == 401 || e.status == 403) {
        await tokens.clear();
        _set(SessionState.signedOut);
      } else {
        rethrow;
      }
    }
  }

  Future<int> requestOtp(String phone) async {
    final res = await api.post<Map<String, dynamic>>(
      '/auth/otp/request',
      data: {'phone': phone},
      auth: false,
    );
    pendingPhone = phone;
    return (res['resendInSeconds'] as num).toInt();
  }

  Future<void> verifyOtp(String code) async {
    final res = await api.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      data: {'phone': pendingPhone, 'code': code},
      auth: false,
    );
    await tokens.save(
      access: res['accessToken'] as String,
      refresh: res['refreshToken'] as String,
    );
    await reloadMe();
  }

  Future<void> onboard({
    required String fullName,
    required String accountType,
    String? email,
    required bool marketing,
  }) async {
    final res = await api.post<Map<String, dynamic>>('/me/onboarding', data: {
      'fullName': fullName,
      'accountType': accountType,
      if (email != null && email.isNotEmpty) 'email': email,
      'kvkkClarification': true,
      'termsOfUse': true,
      'marketing': marketing,
    });
    me = Me.fromJson(res);
    _set(SessionState.signedIn);
  }

  Future<void> reloadMe() async {
    unawaited(BadgeTiers.load(api));
    me = Me.fromJson(await api.get<Map<String, dynamic>>('/me'));
    _set(SessionState.signedIn);
    await refreshUnread();
  }

  /// Ticari ileti iznini verir veya geri alır.
  Future<void> setMarketingConsent(bool granted) async {
    final res = await api.put<Map<String, dynamic>>('/me/consents/marketing', data: {'granted': granted});
    me = Me.fromJson(res);
    notifyListeners();
  }

  Future<void> refreshUnread() async {
    try {
      final res = await api.get<Map<String, dynamic>>('/notifications/unread-count');
      final msgs = await api.get<Map<String, dynamic>>('/conversations/unread');
      unreadCount = (res['unread'] as num).toInt();
      unreadMessages = (msgs['messages'] as num?)?.toInt() ?? 0;
      notifyListeners();
    } catch (_) {
      // Sayı alınamazsa rozetler eski değeri gösterir.
    }
  }

  Future<void> logout() async {
    try {
      await api.post<void>('/auth/logout');
    } catch (_) {
      // Sunucuya ulaşılamasa da cihazdaki oturum silinir.
    }
    await tokens.clear();
    me = null;
    unreadCount = 0;
    unreadMessages = 0;
    _set(SessionState.signedOut);
  }

  /// Açılışta oturum doğrulanamadığında (ör. ağ yok) giriş ekranını gösterir.
  void showSignIn() => _set(SessionState.signedOut);

  void _expired() {
    me = null;
    _set(SessionState.signedOut);
  }

  void _set(SessionState s) {
    state = s;
    notifyListeners();
  }
}
