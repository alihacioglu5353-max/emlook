import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/phone.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key, required this.session});
  final Session session;

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final _phone = TextEditingController(text: '0');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _send() async {
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

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          children: [
            const EmLogo(),
            const SizedBox(height: 48),
            Text('Paylaş. Eşleş.\nTahsil et.', style: t.headlineMedium?.copyWith(fontSize: 34, height: 1.1)),
            const SizedBox(height: 12),
            const Text(
              'Cep telefonuna tek kullanımlık bir kod göndereceğiz. Hesabın yoksa aynı adımla oluşturulur.',
              style: TextStyle(color: EmColors.inkSoft, fontSize: 15),
            ),
            const SizedBox(height: 32),
            TextField(
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
              onSubmitted: (_) => _send(),
            ),
            const SizedBox(height: 20),
            BusyButton(label: 'Kod gönder', busy: _busy, onPressed: _send),
          ],
        ),
      ),
    );
  }
}
