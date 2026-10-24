import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/listings.dart';
import '../../core/payments.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

class PaymentDetailScreen extends StatefulWidget {
  const PaymentDetailScreen({super.key, required this.session, required this.id});
  final Session session;
  final String id;

  @override
  State<PaymentDetailScreen> createState() => _PaymentDetailScreenState();
}

class _PaymentDetailScreenState extends State<PaymentDetailScreen> {
  PaymentRequestView? _p;
  Object? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = PaymentRequestView.fromJson(
          await widget.session.api.get<Map<String, dynamic>>('/payments/requests/${widget.id}'));
      setState(() => _p = p);
    } catch (e) {
      setState(() => _error = e);
    }
  }

  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Talebi iptal et'),
        content: const Text('Ödeme bağlantısı geçersiz olur.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('İptal et')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final p = PaymentRequestView.fromJson(
          await widget.session.api.post<Map<String, dynamic>>('/payments/requests/${widget.id}/cancel'));
      setState(() => _p = p);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _copy(String text, String done) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
  }

  String _date(DateTime t) {
    final l = t.toLocal();
    return '${l.day.toString().padLeft(2, '0')}.${l.month.toString().padLeft(2, '0')}.${l.year} '
        '${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    return Scaffold(
      appBar: AppBar(title: const Text('Ödeme talebi')),
      body: p == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(padding: const EdgeInsets.all(24), child: Notice(text: _error.toString(), tone: NoticeTone.error)),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  Text(formatKurus(p.amount), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
                  Text(p.description, style: const TextStyle(fontSize: 16)),
                  const SizedBox(height: 8),
                  Notice(
                    tone: switch (p.status) {
                      'paid' => NoticeTone.ok,
                      'open' => NoticeTone.warn,
                      _ => NoticeTone.info,
                    },
                    title: paymentStatusLabels[p.status] ?? p.status,
                    text: switch (p.status) {
                      'paid' => 'Ödeme ${_date(p.paidAt!)} tarihinde alındı.',
                      'open' => 'Bağlantı ${_date(p.expiresAt)} tarihine kadar geçerli.',
                      _ => 'Bu talep artık ödenemez.',
                    },
                  ),
                  if (p.status == 'open' && p.link != null && p.role == 'seller') ...[
                    const SizedBox(height: 14),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          const Text('Ödeme bağlantısı', style: TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          SelectableText(p.link!, style: const TextStyle(color: EmColors.inkSoft)),
                          const SizedBox(height: 10),
                          FilledButton.icon(
                            onPressed: () => _copy(p.link!, 'Bağlantı kopyalandı'),
                            icon: const Icon(Icons.copy, size: 18),
                            label: const Text('Bağlantıyı kopyala'),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            onPressed: () => _copy(
                              'Merhaba ${p.payerName}, ${p.description} için ödeme bağlantınız: ${p.link}',
                              'Mesaj kopyalandı; WhatsApp veya SMS ile gönderebilirsin',
                            ),
                            icon: const Icon(Icons.message_outlined, size: 18),
                            label: const Text('Mesaj olarak kopyala'),
                          ),
                        ]),
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(children: [
                        _row('Ödeyen', p.payerName),
                        if (p.listingTitle != null) _row('İlan', p.listingTitle!),
                        _row('İlan danışmanı', p.sellerName ?? '—'),
                        if (p.buyerAgentName != null) _row('Alıcı danışmanı (%${p.buyerShare})', p.buyerAgentName!),
                        const Divider(),
                        _row('Emlook hizmet bedeli', formatKurus(p.platformFee)),
                        _row('İlan danışmanı payı', formatKurus(p.sellerAmount)),
                        if (p.buyerAgentName != null) _row('Alıcı danışmanı payı', formatKurus(p.buyerAmount)),
                        _row('Senin payın', formatKurus(p.myShare), strong: true),
                      ]),
                    ),
                  ),
                  if (p.payouts.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    const Text('Aktarımlar', style: TextStyle(fontWeight: FontWeight.w700)),
                    for (final o in p.payouts)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(payoutKindLabels[o.kind] ?? o.kind),
                        subtitle: Text(payoutStatusLabels[o.status] ?? o.status),
                        trailing: Text(formatKurus(o.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                  ],
                  if (p.status == 'open' && p.role == 'seller') ...[
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: _busy ? null : _cancel,
                      style: TextButton.styleFrom(foregroundColor: EmColors.brand),
                      child: const Text('Talebi iptal et'),
                    ),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _row(String k, String v, {bool strong = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(k, style: const TextStyle(color: EmColors.inkSoft))),
          const SizedBox(width: 12),
          Flexible(
            child: Text(v,
                textAlign: TextAlign.right, style: TextStyle(fontWeight: strong ? FontWeight.w800 : FontWeight.w600)),
          ),
        ]),
      );
}
