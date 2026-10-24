import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/phone.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

class CodeScreen extends StatefulWidget {
  const CodeScreen({super.key, required this.session, required this.resendIn});
  final Session session;
  final int resendIn;

  @override
  State<CodeScreen> createState() => _CodeScreenState();
}

class _CodeScreenState extends State<CodeScreen> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;
  late int _resendIn = widget.resendIn;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_resendIn <= 0) {
        t.cancel();
      } else {
        setState(() => _resendIn--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_code.text.length != 6) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.verifyOtp(_code.text);
      // Yönlendirici oturum değişince doğru ekrana geçer.
    } on ApiException catch (e) {
      _code.clear();
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    try {
      final s = await widget.session.requestOtp(widget.session.pendingPhone!);
      setState(() => _resendIn = s);
      _startTimer();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final phone = TrPhone.display(widget.session.pendingPhone ?? '');
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          children: [
            Text('Kodu gir', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 8),
            Text(
              '$phone numarasına gelen 6 haneli kodu yaz.',
              style: const TextStyle(color: EmColors.inkSoft, fontSize: 15),
            ),
            const SizedBox(height: 28),
            TextField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              autofillHints: const [AutofillHints.oneTimeCode],
              textAlign: TextAlign.center,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(fontSize: 28, letterSpacing: 14, fontWeight: FontWeight.w700),
              decoration: InputDecoration(counterText: '', hintText: '••••••', errorText: _error),
              onChanged: (v) {
                setState(() {});
                if (v.length == 6) _verify();
              },
            ),
            const SizedBox(height: 20),
            BusyButton(
              label: 'Doğrula ve devam et',
              busy: _busy,
              onPressed: _code.text.length == 6 ? _verify : null,
            ),
            const SizedBox(height: 16),
            Center(
              child: _resendIn > 0
                  ? Text('Yeni kod için $_resendIn sn', style: const TextStyle(color: EmColors.inkSoft))
                  : TextButton(onPressed: _resend, child: const Text('Kodu tekrar gönder')),
            ),
          ],
        ),
      ),
    );
  }
}
