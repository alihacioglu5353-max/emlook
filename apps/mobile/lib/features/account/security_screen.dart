import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/password.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Hesap ve güvenlik: ad soyad, e-posta ve e-posta ile giriş parolası.
class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key, required this.session});
  final Session session;

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  Me get _me => widget.session.me!;

  late final _name = TextEditingController(text: _me.fullName ?? '');
  late final _email = TextEditingController(text: _me.email ?? '');
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _repeat = TextEditingController();
  bool _savingInfo = false;
  bool _savingPassword = false;
  bool _obscure = true;
  String? _infoError;
  String? _passwordError;

  @override
  void initState() {
    super.initState();
    _next.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    for (final c in [_name, _email, _current, _next, _repeat]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _saveInfo() async {
    final email = _email.text.trim();
    if (_name.text.trim().length < 3) {
      setState(() => _infoError = 'Ad soyad en az 3 karakter olmalı');
      return;
    }
    if (email.isNotEmpty && !PasswordRules.isEmail(email)) {
      setState(() => _infoError = 'Geçerli bir e-posta adresi gir');
      return;
    }
    setState(() {
      _savingInfo = true;
      _infoError = null;
    });
    try {
      await widget.session.api.patch<Map<String, dynamic>>('/me', data: {
        'fullName': _name.text.trim(),
        if (email.isNotEmpty) 'email': email.toLowerCase(),
      });
      await widget.session.reloadMe();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bilgiler kaydedildi')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _infoError = e.message);
    } finally {
      if (mounted) setState(() => _savingInfo = false);
    }
  }

  Future<void> _savePassword() async {
    final problem = PasswordRules.problem(_next.text);
    if (problem != null) {
      setState(() => _passwordError = problem);
      return;
    }
    if (_next.text != _repeat.text) {
      setState(() => _passwordError = 'Parolalar aynı değil');
      return;
    }
    if (_me.hasPassword && _current.text.isEmpty) {
      setState(() => _passwordError = 'Mevcut parolanı gir');
      return;
    }
    setState(() {
      _savingPassword = true;
      _passwordError = null;
    });
    try {
      await widget.session.changePassword(_next.text, currentPassword: _me.hasPassword ? _current.text : null);
      for (final c in [_current, _next, _repeat]) {
        c.clear();
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Parola kaydedildi. Diğer cihazlardaki oturumlar kapatıldı.')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _passwordError = e.message);
    } finally {
      if (mounted) setState(() => _savingPassword = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    final hasEmail = (me.email ?? '').isNotEmpty;
    return Scaffold(
      appBar: AppBar(title: const Text('Hesap ve güvenlik')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
        children: [
          _card('Hesap bilgileri', [
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Ad soyad')),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'E-posta', helperText: 'E-posta ile giriş ve parola yenileme için'),
            ),
            TextFormField(
              enabled: false,
              initialValue: me.phone,
              decoration: const InputDecoration(labelText: 'Cep telefonu', helperText: 'Telefon numarası değiştirilemez'),
            ),
            if (_infoError != null) Notice(tone: NoticeTone.error, text: _infoError!),
            OutlinedButton(onPressed: _savingInfo ? null : _saveInfo, child: Text(_savingInfo ? 'Kaydediliyor…' : 'Kaydet')),
          ]),
          const SizedBox(height: 16),
          _card(me.hasPassword ? 'Parolayı değiştir' : 'E-posta ile giriş için parola belirle', [
            if (!hasEmail)
              const Notice(tone: NoticeTone.warn, text: 'Önce yukarıdan e-posta adresini ekleyip kaydet.')
            else ...[
              Text(
                me.hasPassword
                    ? 'Parolanı değiştirdiğinde diğer cihazlardaki oturumların kapanır.'
                    : 'Parola belirlersen ${me.email} adresi ve parolanla da giriş yapabilirsin.',
                style: const TextStyle(color: EmColors.inkSoft, fontSize: 13),
              ),
              if (me.hasPassword) _passwordField(_current, 'Mevcut parola', AutofillHints.password),
              _passwordField(_next, 'Yeni parola', AutofillHints.newPassword),
              _Rules(password: _next.text),
              _passwordField(_repeat, 'Yeni parola (tekrar)', AutofillHints.newPassword),
              if (_passwordError != null) Notice(tone: NoticeTone.error, text: _passwordError!),
              BusyButton(label: 'Parolayı kaydet', busy: _savingPassword, onPressed: _savePassword),
            ],
          ]),
        ],
      ),
    );
  }

  Widget _passwordField(TextEditingController c, String label, String hint) => TextField(
        controller: c,
        obscureText: _obscure,
        autofillHints: [hint],
        decoration: InputDecoration(
          labelText: label,
          suffixIcon: IconButton(
            tooltip: _obscure ? 'Parolayı göster' : 'Parolayı gizle',
            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
            onPressed: () => setState(() => _obscure = !_obscure),
          ),
        ),
      );

  Widget _card(String title, List<Widget> children) => Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 14),
              for (final c in children) Padding(padding: const EdgeInsets.only(bottom: 12), child: c),
            ],
          ),
        ),
      );
}

/// Parola kurallarının canlı göstergesi
class _Rules extends StatelessWidget {
  const _Rules({required this.password});
  final String password;

  @override
  Widget build(BuildContext context) {
    Widget rule(bool ok, String text) => Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(ok ? Icons.check_circle : Icons.radio_button_unchecked, size: 16, color: ok ? EmColors.ok : EmColors.inkSoft),
          const SizedBox(width: 6),
          Text(text, style: TextStyle(fontSize: 12, color: ok ? EmColors.ok : EmColors.inkSoft)),
        ]);
    return Wrap(spacing: 14, runSpacing: 4, children: [
      rule(PasswordRules.longEnough(password), 'En az 8 karakter'),
      rule(PasswordRules.hasLetter(password), 'Harf'),
      rule(PasswordRules.hasDigit(password), 'Rakam'),
    ]);
  }
}
