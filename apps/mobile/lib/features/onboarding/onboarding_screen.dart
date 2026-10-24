import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.session});
  final Session session;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  String? _type;
  bool _kvkk = false;
  bool _terms = false;
  bool _marketing = false;
  bool _busy = false;
  String? _error;

  bool get _valid => _type != null && _kvkk && _terms && _name.text.trim().length >= 3;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.onboard(
        fullName: _name.text.trim(),
        accountType: _type!,
        email: _email.text.trim(),
        marketing: _marketing,
      );
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _typeCard(String value, String title, String text) {
    final selected = _type == value;
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () => setState(() => _type = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: EmColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: selected ? EmColors.brand : EmColors.line, width: selected ? 2 : 1),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(text, style: const TextStyle(color: EmColors.inkSoft, fontSize: 13)),
                ],
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? EmColors.brand : EmColors.line,
            ),
          ],
        ),
      ),
    );
  }

  Widget _check(bool value, ValueChanged<bool> onChanged, String text, String slug) => CheckboxListTile(
        value: value,
        onChanged: (v) => setState(() => onChanged(v ?? false)),
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: EdgeInsets.zero,
        dense: true,
        activeColor: EmColors.brand,
        title: Text(text, style: const TextStyle(fontSize: 14)),
        secondary: IconButton(
          tooltip: 'Metni oku',
          icon: const Icon(Icons.description_outlined),
          onPressed: () => context.push('/yasal/$slug'),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Hesap kurulumu'),
        actions: [TextButton(onPressed: widget.session.logout, child: const Text('Çıkış'))],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          children: [
            Text('Seni tanıyalım', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 6),
            const Text('Hesap tipini bir kez seçersin.', style: TextStyle(color: EmColors.inkSoft)),
            const SizedBox(height: 20),
            _typeCard('agent', 'Emlak danışmanıyım',
                'Portföy paylaşır, eşleşir, komisyonumu online tahsil ederim.'),
            const SizedBox(height: 10),
            _typeCard('consumer', 'Mülk sahibiyim',
                'İlanları görüntüler, doğrulanmış danışmanlara ulaşırım.'),
            const SizedBox(height: 24),
            TextField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              decoration: const InputDecoration(labelText: 'Ad soyad'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(labelText: 'E-posta (isteğe bağlı)'),
            ),
            const SizedBox(height: 16),
            _check(_kvkk, (v) => _kvkk = v, 'KVKK Aydınlatma Metni\'ni okudum ve anladım.', 'kvkk'),
            _check(_terms, (v) => _terms = v, 'Kullanım Koşulları\'nı kabul ediyorum.', 'kosullar'),
            _check(_marketing, (v) => _marketing = v,
                'Ticari elektronik ileti metni kapsamında kampanya ve duyuru almak istiyorum (isteğe bağlı).',
                'ticari-ileti'),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Notice(text: _error!, tone: NoticeTone.error),
            ],
            const SizedBox(height: 20),
            BusyButton(label: 'Hesabımı oluştur', busy: _busy, onPressed: _valid ? _submit : null),
          ],
        ),
      ),
    );
  }
}
