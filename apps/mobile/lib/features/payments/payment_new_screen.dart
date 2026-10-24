import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/listings.dart';
import '../../core/payments.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Komisyon ödeme talebi oluşturma; bölüşüm önizlemesiyle.
class PaymentNewScreen extends StatefulWidget {
  const PaymentNewScreen({super.key, required this.session});
  final Session session;

  @override
  State<PaymentNewScreen> createState() => _PaymentNewScreenState();
}

class _PaymentNewScreenState extends State<PaymentNewScreen> {
  final _amount = TextEditingController();
  final _description = TextEditingController();
  final _payerName = TextEditingController();
  final _payerPhone = TextEditingController();
  final _payerEmail = TextEditingController();
  final _agentQuery = TextEditingController();

  int _feeBps = 0;
  List<ListingCard> _listings = [];
  String? _listingId;
  PersonCard? _buyer;
  List<PersonCard> _agentResults = [];
  double? _share; // null = ilandaki oran
  Timer? _debounce;
  bool _saving = false;
  String? _error;

  ApiClient get _api => widget.session.api;

  @override
  void initState() {
    super.initState();
    _api.get<Map<String, dynamic>>('/payments/summary').then((s) {
      if (mounted) setState(() => _feeBps = (s['platformFeeBps'] as num).toInt());
    }).catchError((_) {});
    _api.get<Map<String, dynamic>>('/listings/mine', query: {'limit': 100}).then((res) {
      if (mounted) {
        setState(() => _listings = (res['items'] as List)
            .map((e) => ListingCard.fromJson(e as Map<String, dynamic>))
            .where((l) => l.status != 'draft')
            .toList());
      }
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _debounce?.cancel();
    for (final c in [_amount, _description, _payerName, _payerPhone, _payerEmail, _agentQuery]) {
      c.dispose();
    }
    super.dispose();
  }

  void _searchAgents(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() => _agentResults = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final list = await _api.get<List<dynamic>>('/search/agents', query: {'q': q.trim()});
        if (mounted) {
          setState(() => _agentResults = list
              .map((e) => PersonCard.fromJson(e as Map<String, dynamic>))
              .where((p) => p.id != widget.session.me?.id)
              .toList());
        }
      } catch (_) {}
    });
  }

  ListingCard? get _listing => _listings.where((l) => l.id == _listingId).firstOrNull;
  int get _sharePct => _buyer == null ? 0 : (_share ?? (_listing?.cobrokeShare ?? 50).toDouble()).round();

  ({int platform, int seller, int buyer})? get _preview {
    final k = parseTl(_amount.text);
    if (k == null || k <= 0) return null;
    final platform = (k * _feeBps / 10000).round();
    final rest = k - platform;
    final b = (rest * _sharePct) ~/ 100;
    return (platform: platform, seller: rest - b, buyer: b);
  }

  Future<void> _submit() async {
    final kurus = parseTl(_amount.text);
    if (kurus == null || kurus < 100) {
      setState(() => _error = 'Geçerli bir tutar girin (en az 1 TL)');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final phone = _payerPhone.text.replaceAll(RegExp(r'\D'), '');
      final created = await _api.post<Map<String, dynamic>>('/payments/requests', data: {
        'amount': kurus,
        'description': _description.text.trim(),
        'payerName': _payerName.text.trim(),
        if (phone.isNotEmpty) 'payerPhone': phone,
        if (_payerEmail.text.trim().isNotEmpty) 'payerEmail': _payerEmail.text.trim(),
        if (_listingId != null) 'listingId': _listingId,
        if (_buyer != null) 'buyerAgentId': _buyer!.id,
        if (_buyer != null && _share != null) 'buyerShare': _share!.round(),
      });
      if (mounted) context.pushReplacement('/odemeler/${created['id']}');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _preview;
    return Scaffold(
      appBar: AppBar(title: const Text('Ödeme talebi')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
            decoration: const InputDecoration(labelText: 'Komisyon tutarı (₺, KDV dahil)'),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            maxLength: 200,
            decoration: const InputDecoration(labelText: 'Açıklama', hintText: 'Moda 3+1 satış komisyonu', counterText: ''),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            initialValue: _listingId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'İlan (isteğe bağlı)'),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('İlan seçme')),
              for (final l in _listings)
                DropdownMenuItem<String?>(value: l.id, child: Text(l.title, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() => _listingId = v),
          ),
          const SizedBox(height: 18),
          const Text('Ödeyen', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          TextField(controller: _payerName, decoration: const InputDecoration(labelText: 'Ad soyad / unvan')),
          const SizedBox(height: 12),
          TextField(
            controller: _payerPhone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'Telefon (isteğe bağlı)'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _payerEmail,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'E-posta (isteğe bağlı)'),
          ),
          const SizedBox(height: 18),
          const Text('Paylaşımlı işlem', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const Text('Alıcıyı başka bir danışman getirdiyse payı otomatik aktarılır.',
              style: TextStyle(color: EmColors.inkSoft, fontSize: 13)),
          const SizedBox(height: 8),
          if (_buyer == null) ...[
            TextField(
              controller: _agentQuery,
              decoration: const InputDecoration(labelText: 'Alıcı danışmanını ara', prefixIcon: Icon(Icons.search)),
              onChanged: _searchAgents,
            ),
            for (final a in _agentResults.take(5))
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(a.fullName ?? '—'),
                subtitle: Text(a.subtitle),
                trailing: const Icon(Icons.add_circle_outline),
                onTap: () => setState(() {
                  _buyer = a;
                  _agentResults = [];
                  _agentQuery.clear();
                }),
              ),
          ] else ...[
            Card(
              child: ListTile(
                title: Text(_buyer!.fullName ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('Payı %$_sharePct'),
                trailing: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() {
                    _buyer = null;
                    _share = null;
                  }),
                ),
              ),
            ),
            Slider(
              value: _sharePct.toDouble(),
              max: 100,
              divisions: 20,
              label: '%$_sharePct',
              onChanged: (v) => setState(() => _share = v),
            ),
          ],
          if (p != null) ...[
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(children: [
                  _row('Emlook hizmet bedeli (%${(_feeBps / 100).toStringAsFixed(_feeBps % 100 == 0 ? 0 : 2)})',
                      formatKurus(p.platform)),
                  _row('Senin payın', formatKurus(p.seller), strong: true),
                  if (_buyer != null) _row('${_buyer!.fullName} (%$_sharePct)', formatKurus(p.buyer)),
                ]),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Notice(text: _error!, tone: NoticeTone.error),
          ],
          const SizedBox(height: 18),
          BusyButton(label: 'Ödeme bağlantısı oluştur', busy: _saving, onPressed: _submit),
          const SizedBox(height: 8),
          Text('Bağlantı ${paymentStatusLabels['open']!.toLowerCase()} durumunda 7 gün geçerli kalır.',
              textAlign: TextAlign.center, style: const TextStyle(color: EmColors.inkSoft, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _row(String k, String v, {bool strong = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Expanded(child: Text(k, style: const TextStyle(color: EmColors.inkSoft))),
          Text(v, style: TextStyle(fontWeight: strong ? FontWeight.w800 : FontWeight.w600)),
        ]),
      );
}
