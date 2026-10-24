import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Danışmanın ofis durumu. Ofis açma ve ekip yönetimi web panelindedir.
class OfficeScreen extends StatefulWidget {
  const OfficeScreen({super.key, required this.session});
  final Session session;

  @override
  State<OfficeScreen> createState() => _OfficeScreenState();
}

class _OfficeScreenState extends State<OfficeScreen> {
  MyOffice? _data;
  Object? _error;
  String? _busy;

  final _search = TextEditingController();
  List<OfficeSearchItem>? _results;
  bool _searching = false;

  ApiClient get _api => widget.session.api;
  bool get _verified => widget.session.me?.isVerified ?? false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = MyOffice.fromJson(await _api.get<Map<String, dynamic>>('/me/office'));
      setState(() {
        _data = d;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e);
    }
  }

  /// İşlemi çalıştırır, dönen güncel durumu ekrana ve oturuma yansıtır.
  Future<void> _act(String key, Future<Map<String, dynamic>> Function() call, {String? done}) async {
    setState(() => _busy = key);
    try {
      final d = MyOffice.fromJson(await call());
      setState(() => _data = d);
      await widget.session.reloadMe();
      if (done != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _runSearch() async {
    final q = _search.text.trim();
    if (q.length < 2) return;
    setState(() => _searching = true);
    try {
      final list = await _api.get<List<dynamic>>('/offices', query: {'q': q});
      setState(() => _results =
          list.map((e) => OfficeSearchItem.fromJson(e as Map<String, dynamic>)).toList());
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _confirmLeave(OfficeRef office) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ofisten ayrıl'),
        content: Text('${office.name} ofisinden ayrılırsan Bağımsız Danışman olarak görünürsün.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Ayrıl', style: TextStyle(color: EmColors.brand)),
          ),
        ],
      ),
    );
    if (ok == true) {
      await _act('leave', () => _api.post<Map<String, dynamic>>('/me/office/leave'),
          done: 'Ofisten ayrıldın');
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Ofisim')),
      body: d == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Notice(text: _error.toString(), tone: NoticeTone.error),
                        const SizedBox(height: 12),
                        OutlinedButton(onPressed: _load, child: const Text('Tekrar dene')),
                      ]),
                    ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
                children: [
                  if (!_verified) ...[
                    const Notice(
                      tone: NoticeTone.warn,
                      title: 'Önce danışman onayı gerekiyor',
                      text: 'Bir ofise katılmak için onaylı danışman olmalısın.',
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (d.invitations.isNotEmpty) ...[
                    _section('Gelen davetler', [
                      if (d.hasOffice)
                        Text(
                          'Kabul edersen ${d.office!.name} ofisinden ayrılıp yeni ofise geçersin.',
                          style: const TextStyle(color: EmColors.inkSoft, fontSize: 13),
                        ),
                      for (final inv in d.invitations) _invitationTile(inv),
                    ]),
                    const SizedBox(height: 16),
                  ],
                  if (d.hasOffice) _membershipCard(d) else _independentCard(),
                  if (d.requests.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    _section('Bekleyen taleplerim', [
                      for (final r in d.requests)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(r.office.name),
                          subtitle: Text(r.office.place),
                          trailing: TextButton(
                            onPressed: _busy != null
                                ? null
                                : () => _act(
                                      'cancel:${r.membershipId}',
                                      () => _api.delete<Map<String, dynamic>>(
                                          '/me/office/requests/${r.membershipId}'),
                                    ),
                            child: const Text('Geri çek'),
                          ),
                        ),
                    ]),
                  ],
                  if (!d.hasOffice || d.role != OfficeRole.owner) ...[
                    const SizedBox(height: 16),
                    _searchSection(d),
                  ],
                  const SizedBox(height: 16),
                  const Text(
                    'Ofis açma ve ekip yönetimi Emlook web panelinden yapılır.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: EmColors.inkSoft, fontSize: 13),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _invitationTile(OfficeLink inv) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(inv.office.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
            Text(inv.office.place, style: const TextStyle(color: EmColors.inkSoft)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: BusyButton(
                  label: 'Kabul et',
                  busy: _busy == 'accept:${inv.membershipId}',
                  onPressed: !_verified || _busy != null
                      ? null
                      : () => _act(
                            'accept:${inv.membershipId}',
                            () => _api.post<Map<String, dynamic>>(
                                '/me/office/invitations/${inv.membershipId}/accept'),
                            done: '${inv.office.name} ekibine katıldın',
                          ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy != null
                      ? null
                      : () => _act(
                            'decline:${inv.membershipId}',
                            () => _api.post<Map<String, dynamic>>(
                                '/me/office/invitations/${inv.membershipId}/decline'),
                          ),
                  child: const Text('Reddet'),
                ),
              ),
            ]),
          ],
        ),
      );

  Widget _membershipCard(MyOffice d) {
    final office = d.office!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(
                child: Text(office.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ),
              RoleChip(d.role!),
            ]),
            const SizedBox(height: 4),
            Text(office.place, style: const TextStyle(color: EmColors.inkSoft)),
            if (!office.isActive) ...[
              const SizedBox(height: 14),
              const Notice(
                tone: NoticeTone.warn,
                title: 'Ofisin yönetici incelemesinde',
                text: 'Onaylandığında bildirim alacaksın.',
              ),
            ],
            if (d.role == OfficeRole.owner) ...[
              const SizedBox(height: 12),
              const Text(
                'Ofis sahibi olarak ayrılmak için önce sahipliği web panelinden devretmelisin.',
                style: TextStyle(color: EmColors.inkSoft, fontSize: 13),
              ),
            ] else ...[
              const SizedBox(height: 14),
              OutlinedButton(
                onPressed: _busy != null ? null : () => _confirmLeave(office),
                style: OutlinedButton.styleFrom(
                  foregroundColor: EmColors.brand,
                  side: const BorderSide(color: EmColors.brand),
                ),
                child: const Text('Ofisten ayrıl'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _independentCard() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: EmColors.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: EmColors.line),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Bağımsız Danışman', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            SizedBox(height: 4),
            Text(
              'Bir ofise bağlı değilsin. Ofisini bulup katılma talebi gönderebilirsin.',
              style: TextStyle(color: EmColors.inkSoft),
            ),
          ],
        ),
      );

  Widget _searchSection(MyOffice d) {
    final pending = {
      if (d.office != null) d.office!.id,
      ...d.requests.map((r) => r.office.id),
    };
    return _section(d.hasOffice ? 'Başka bir ofise geç' : 'Ofisini bul', [
      if (d.hasOffice)
        const Text(
          'Yeni ofis talebini onaylarsa mevcut ofisinden ayrılmış sayılırsın.',
          style: TextStyle(color: EmColors.inkSoft, fontSize: 13),
        ),
      TextField(
        controller: _search,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => _runSearch(),
        decoration: InputDecoration(
          labelText: 'Ofis adı veya unvan',
          suffixIcon: _searching
              ? const Padding(
                  padding: EdgeInsets.all(14),
                  child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                )
              : IconButton(icon: const Icon(Icons.search), onPressed: _runSearch),
        ),
      ),
      if (_results != null && _results!.isEmpty)
        const Text('Eşleşen aktif bir ofis bulunamadı.', style: TextStyle(color: EmColors.inkSoft)),
      for (final o in _results ?? <OfficeSearchItem>[])
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(o.name, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text('${o.place} · ${o.memberCount} danışman'),
          trailing: pending.contains(o.id)
              ? const Text('Gönderildi', style: TextStyle(color: EmColors.inkSoft))
              : TextButton(
                  onPressed: !_verified || _busy != null
                      ? null
                      : () => _act(
                            'join:${o.id}',
                            () => _api.post<Map<String, dynamic>>('/offices/${o.id}/join-requests'),
                            done: 'Katılma talebi gönderildi',
                          ),
                  child: const Text('Katıl'),
                ),
        ),
    ]);
  }

  Widget _section(String title, List<Widget> children) => Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              for (final c in children) Padding(padding: const EdgeInsets.only(bottom: 8), child: c),
            ],
          ),
        ),
      );
}
