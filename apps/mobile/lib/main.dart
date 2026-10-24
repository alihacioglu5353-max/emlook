import 'package:flutter/material.dart';

import 'app.dart';
import 'features/session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session();
  runApp(EmlookApp(session: session));
  try {
    await session.bootstrap();
  } catch (_) {
    // Ağ yoksa giriş ekranı açılır; kayıtlı oturum silinmez.
    session.showSignIn();
  }
}
