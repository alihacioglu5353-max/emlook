import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/listings.dart';
import '../../core/payments.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Ödemeler: kazanç özeti, IBAN hesabı ve ödeme talepleri.
class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key, required this.session});
  final Session session;

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  PaymentSummary? _summary;
  PayoutAccount? _account;
  bool _accountLoaded = false;
  List<PaymentRequestView>? _requests;
  Object? _error;

  ApiClient get _api => widget.session.api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _api.get<Map<String, dynamic>>('/payments/summary'),
        _api.get<Map<String, dynamic>>('/me/payout-account'),
        _api.get<List<dynamic>>('/payments/requests'),
      ]);
      final acc = (results[1] as Map<String, dynamic>)['account'] as Map<String, dynamic>?;
      setState(() {
        _summary = PaymentSummary.fromJson(results[0] as Map<String, dynamic>);
        _account = acc == null ? null : PayoutAccount.fromJson(acc);
        _accountLoaded = true;
        _requests = (results[2] as List).map((e) => PaymentRequestView.fromJson(e as Map<String, dynamic>)).toList();
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e);
    }
  }

  Future<void> _editAccount() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AccountSheet(api: _api, current: _account),
    );
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    final verified = widget.session.me?.isVerified ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Ödemeler')),
      floatingActionButton: verified && _account != null
          ? FloatingActionButton.extended(
              onPressed: () async {
                await context.push('/odemeler/yeni');
                _load();
              },
              backgroundColor: EmColors.brand,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Ödeme talebi'),
            )
          : null,
      body: s == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(padding: const EdgeInsets.all(24), child: Notice(text: _error.toString(), tone: NoticeTone.error)),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                children: [
                  Row(children: [
                    _Stat('Aktarılan', formatKurus(s.settled), EmColors.ok),
                    const SizedBox(width: 8),
                    _Stat('Bekleyen', formatKurus(s.pending), EmColors.ink),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [
                    _Stat('IBAN bekleyen', formatKurus(s.held), EmColors.warn),
                    const SizedBox(width: 8),
                    _Stat('Açık talep', '${s.openRequests}', EmColors.ink),
                  ]),
                  const SizedBox(height: 16),
                  _accountCard(),
                  const SizedBox(height: 16),
                  const Text('Ödeme talepleri', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  if (_requests!.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Text('Henüz ödeme talebi yok. Komisyonunu tek bağlantıyla, faturalı tahsil edebilirsin.',
                          textAlign: TextAlign.center, style: TextStyle(color: EmColors.inkSoft)),
                    ),
                  for (final r in _requests!)
                    Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        onTap: () async {
                          await context.push('/odemeler/${r.id}');
                          _load();
                        },
                        title: Text(r.description, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(
                            '${r.payerName} · ${r.role == 'buyer' ? 'Alıcı danışmanı' : 'İlan danışmanı'}\n${paymentStatusLabels[r.status] ?? r.status}'),
                        isThreeLine: true,
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(formatKurus(r.amount), style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text('Payın ${formatKurus(r.myShare)}',
                                style: const TextStyle(fontSize: 12, color: EmColors.inkSoft)),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }

  Widget _accountCard() {
    if (!_accountLoaded) return const SizedBox.shrink();
    final a = _account;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Expanded(child: Text('Ödeme alacağın hesap', style: TextStyle(fontWeight: FontWeight.w700))),
            if (a != null)
              Text(
                a.status == 'verified' ? 'Onaylı' : a.status == 'rejected' ? 'Reddedildi' : 'İnceleniyor',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: a.status == 'verified' ? EmColors.ok : a.status == 'rejected' ? EmColors.brand : EmColors.warn,
                ),
              ),
          ]),
          const SizedBox(height: 6),
          if (a == null)
            const Text('Komisyon tahsil etmek ve payını almak için IBAN ekle.',
                style: TextStyle(color: EmColors.inkSoft))
          else ...[
            Text(a.holderName, style: const TextStyle(fontWeight: FontWeight.w600)),
            Text(a.iban, style: const TextStyle(color: EmColors.inkSoft, letterSpacing: 0.5)),
          ],
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _editAccount, child: Text(a == null ? 'IBAN ekle' : 'Hesabı güncelle')),
        ]),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.color);
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(color: EmColors.inkSoft, fontSize: 12)),
              const SizedBox(height: 4),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(value, style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w800)),
              ),
            ]),
          ),
        ),
      );
}

class _AccountSheet extends StatefulWidget {
  const _AccountSheet({required this.api, required this.current});
  final ApiClient api;
  final PayoutAccount? current;

  @override
  State<_AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<_AccountSheet> {
  late final _holder = TextEditingController(text: widget.current?.holderName);
  final _iban = TextEditingController(text: 'TR');
  final _taxId = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _holder.dispose();
    _iban.dispose();
    _taxId.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.put<Object?>('/me/payout-account', data: {
        'holderName': _holder.text.trim(),
        'iban': _iban.text.replaceAll(' ', '').toUpperCase(),
        'taxId': _taxId.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('IBAN hesabı', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        const Text('Hesap sahibi, vergi kimliğindeki adla aynı olmalı.', style: TextStyle(color: EmColors.inkSoft)),
        const SizedBox(height: 14),
        TextField(controller: _holder, decoration: const InputDecoration(labelText: 'Hesap sahibi')),
        const SizedBox(height: 10),
        TextField(
          controller: _iban,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(labelText: 'IBAN', hintText: 'TR00 0000 0000 0000 0000 0000 00'),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _taxId,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(11)],
          decoration: const InputDecoration(labelText: 'TCKN veya VKN'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          Notice(text: _error!, tone: NoticeTone.error),
        ],
        const SizedBox(height: 14),
        BusyButton(label: 'Kaydet', busy: _busy, onPressed: _save),
      ]),
    );
  }
}
