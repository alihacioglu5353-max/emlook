import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/password.dart';
import '../../core/phone.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Giriş: Telefon + SMS kodu (kayıt da buradan) veya e-posta + parola.
class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key, required this.session});
  final Session session;

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

enum _Method { phone, email }

class _PhoneScreenState extends State<PhoneScreen> {
  _Method _method = _Method.phone;
  final _phone = TextEditingController(text: '0');
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    if (!TrPhone.isValid(_phone.text)) {
      setState(() => _error = 'Geçerli bir cep telefonu numarası gir');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final resendIn = await widget.session.requestOtp(_phone.text);
      if (mounted) context.push('/giris/kod', extra: resendIn);
    } on ApiException catch (e) {
      // Bekleme süresindeyse yine de kod ekranına geç; önceki kod geçerli.
      if (e.code == 'OTP_RATE_LIMITED' && mounted) {
        widget.session.pendingPhone = _phone.text;
        context.push('/giris/kod', extra: (e.data?['retryAfterSeconds'] as num?)?.toInt() ?? 60);
      } else {
        setState(() => _error = e.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _passwordLogin() async {
    if (!PasswordRules.isEmail(_email.text)) {
      setState(() => _error = 'Geçerli bir e-posta adresi gir');
      return;
    }
    if (_password.text.isEmpty) {
      setState(() => _error = 'Parolanı gir');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.passwordLogin(_email.text, _password.text);
      // Yönlendirici oturum açılınca akışa geçirir.
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final phone = _method == _Method.phone;
    return Scaffold(
      body: SafeArea(
        child: AutofillGroup(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
            children: [
              const EmLogo(),
              const SizedBox(height: 40),
              Text('Paylaş. Eşleş.\nTahsil et.', style: t.headlineMedium?.copyWith(fontSize: 34, height: 1.1)),
              const SizedBox(height: 12),
              Text(
                phone
                    ? 'Cep telefonuna tek kullanımlık bir kod göndereceğiz. Hesabın yoksa aynı adımla oluşturulur.'
                    : 'Hesabına e-posta adresin ve parolanla gir. Parolanı panelden veya profilinden belirleyebilirsin.',
                style: const TextStyle(color: EmColors.inkSoft, fontSize: 15),
              ),
              const SizedBox(height: 24),
              SegmentedButton<_Method>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: _Method.phone, icon: Icon(Icons.smartphone_rounded), label: Text('Telefon')),
                  ButtonSegment(value: _Method.email, icon: Icon(Icons.alternate_email_rounded), label: Text('E-posta')),
                ],
                selected: {_method},
                onSelectionChanged: (s) => setState(() {
                  _method = s.first;
                  _error = null;
                }),
              ),
              const SizedBox(height: 20),
              if (phone) ...[
                TextField(
                  key: const Key('login-phone'),
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9 +]')),
                    LengthLimitingTextInputFormatter(17),
                  ],
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
                  decoration: InputDecoration(
                    labelText: 'Cep telefonu',
                    hintText: '05XX XXX XX XX',
                    errorText: _error,
                  ),
                  onSubmitted: (_) => _sendCode(),
                ),
                const SizedBox(height: 20),
                BusyButton(label: 'Kod gönder', busy: _busy, onPressed: _sendCode),
              ] else ...[
                TextField(
                  key: const Key('login-email'),
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email, AutofillHints.username],
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'E-posta'),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('login-password'),
                  controller: _password,
                  obscureText: _obscure,
                  autofillHints: const [AutofillHints.password],
                  decoration: InputDecoration(
                    labelText: 'Parola',
                    errorText: _error,
                    suffixIcon: IconButton(
                      tooltip: _obscure ? 'Parolayı göster' : 'Parolayı gizle',
                      icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  onSubmitted: (_) => _passwordLogin(),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => context.push('/giris/parola-sifirla', extra: _email.text.trim()),
                    child: const Text('Parolamı unuttum'),
                  ),
                ),
                BusyButton(label: 'Giriş yap', busy: _busy, onPressed: _passwordLogin),
              ],
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: EmColors.paper,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Row(children: [
                  Icon(Icons.verified_outlined, color: EmColors.brand),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Emlak danışmanı mısın? Telefonla kayıt olup hesap tipini "Danışman" seç; ardından belgelerini yükleyerek onay başvurunu yap.',
                      style: TextStyle(fontSize: 13, color: EmColors.inkSoft, height: 1.35),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: 20),
              _LegalNotice(),
            ],
          ),
        ),
      ),
    );
  }
}

/// Giriş ekranındaki hukuki metin bağlantıları
class _LegalNotice extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    TextSpan link(String text, String slug) => TextSpan(
          text: text,
          style: const TextStyle(color: EmColors.ink, fontWeight: FontWeight.w600, decoration: TextDecoration.underline),
          recognizer: TapGestureRecognizer()..onTap = () => context.push('/yasal/$slug'),
        );
    return Text.rich(
      TextSpan(
        style: const TextStyle(fontSize: 12, color: EmColors.inkSoft, height: 1.45),
        children: [
          const TextSpan(text: 'Devam ederek '),
          link('Kullanım Koşulları', 'kosullar'),
          const TextSpan(text: '\'nı kabul etmiş olursun. Kişisel verilerin '),
          link('KVKK Aydınlatma Metni', 'kvkk'),
          const TextSpan(text: ' kapsamında işlenir. '),
          link('Ticari ileti izni', 'ticari-ileti'),
          const TextSpan(text: ' isteğe bağlıdır.'),
        ],
      ),
      textAlign: TextAlign.center,
    );
  }
}
