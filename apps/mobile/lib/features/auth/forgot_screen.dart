import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/password.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Parolamı unuttum: e-postaya yenileme bağlantısı gönderir (bağlantı web'de açılır).
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, required this.session, this.email});
  final Session session;
  final String? email;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final _email = TextEditingController(text: widget.email ?? '');
  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!PasswordRules.isEmail(_email.text)) {
      setState(() => _error = 'Geçerli bir e-posta adresi gir');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.forgotPassword(_email.text);
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Parolamı unuttum')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
        children: [
          if (_sent) ...[
            Notice(
              tone: NoticeTone.ok,
              title: 'E-postanı kontrol et',
              text: '${_email.text.trim()} adresi bir hesaba kayıtlıysa parola yenileme bağlantısı gönderdik. '
                  'Bağlantı 30 dakika geçerli ve tek kullanımlık.',
            ),
            const SizedBox(height: 16),
            const Text(
              'E-posta gelmediyse gereksiz klasörüne bak veya telefonunla SMS koduyla giriş yap.',
              style: TextStyle(color: EmColors.inkSoft),
            ),
            const SizedBox(height: 20),
            OutlinedButton(onPressed: () => Navigator.of(context).maybePop(), child: const Text('Girişe dön')),
          ] else ...[
            const Text(
              'Hesabına kayıtlı e-posta adresini yaz; parolanı yenilemen için bir bağlantı gönderelim.',
              style: TextStyle(color: EmColors.inkSoft, fontSize: 15),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              autocorrect: false,
              decoration: InputDecoration(labelText: 'E-posta', errorText: _error),
              onSubmitted: (_) => _send(),
            ),
            const SizedBox(height: 20),
            BusyButton(label: 'Bağlantı gönder', busy: _busy, onPressed: _send),
          ],
        ],
      ),
    );
  }
}
