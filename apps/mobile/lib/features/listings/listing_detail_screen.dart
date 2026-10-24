import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart' show FormData, MultipartFile;

import '../../core/api_client.dart';
import '../../core/listings.dart';
import '../../core/theme.dart';
import '../../widgets/auth_image.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// İlan detayı. Sahibi fotoğraf, EİDS ve yayın işlemlerini buradan yapar;
/// diğer kullanıcılar ilgi gösterir, mesaj gönderir veya şikâyet eder.
class ListingDetailScreen extends StatefulWidget {
  const ListingDetailScreen({super.key, required this.session, required this.id});
  final Session session;
  final String id;

  @override
  State<ListingDetailScreen> createState() => _ListingDetailScreenState();
}

class _ListingDetailScreenState extends State<ListingDetailScreen> {
  ListingDetail? _l;
  Object? _error;
  String? _busy;
  int _photoIndex = 0;

  ApiClient get _api => widget.session.api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final l = ListingDetail.fromJson(await _api.get<Map<String, dynamic>>('/listings/${widget.id}'));
      setState(() {
        _l = l;
        _error = null;
        if (_photoIndex >= l.photos.length) _photoIndex = 0;
      });
    } catch (e) {
      setState(() => _error = e);
    }
  }

  /// Sahibin işlemleri: güncel ilanı döndürür.
  Future<void> _act(String key, Future<Object?> Function() call, {String? done, bool reload = true}) async {
    setState(() => _busy = key);
    try {
      final res = await call();
      if (res is Map<String, dynamic> && res.containsKey('photos')) {
        setState(() => _l = ListingDetail.fromJson(res));
      } else if (reload) {
        await _load();
      }
      if (done != null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _addPhotos() async {
    final files = await FilePicker.pickFiles(type: FileType.image);
    final paths = files.where((f) => f.path != null).toList();
    if (paths.isEmpty) return;
    setState(() => _busy = 'photo');
    try {
      for (final f in paths) {
        final form = FormData.fromMap({'file': await MultipartFile.fromFile(f.path!, filename: f.name)});
        await _api.post<Object?>('/listings/${widget.id}/photos', data: form);
      }
      await _load();
    } catch (e) {
      if (mounted) showError(context, e);
      await _load();
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _makeCover(ListingPhoto p) async {
    final ids = [p.id, ..._l!.photos.where((x) => x.id != p.id).map((x) => x.id)];
    await _act('order', () => _api.put<Object?>('/listings/${widget.id}/photos/order', data: {'ids': ids}));
    setState(() => _photoIndex = 0);
  }

  Future<void> _removePhoto(ListingPhoto p) async {
    authImageCache.evict(p.url);
    await _act('photo', () => _api.delete<Object?>('/listings/${widget.id}/photos/${p.id}'));
  }

  Future<bool> _confirm(String title, String body, String action) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(action)),
          ],
        ),
      ) ??
      false;

  Future<void> _delete() async {
    if (!await _confirm('Taslağı sil', 'Bu taslak kalıcı olarak silinecek.', 'Sil')) return;
    setState(() => _busy = 'delete');
    try {
      await _api.delete<Object?>('/listings/${widget.id}');
      if (mounted) context.pop(true);
    } catch (e) {
      if (mounted) showError(context, e);
      setState(() => _busy = null);
    }
  }

  Future<void> _message() async {
    setState(() => _busy = 'message');
    try {
      final c = await _api.post<Map<String, dynamic>>('/conversations',
          data: {'userId': _l!.ownerId, 'listingId': _l!.id});
      if (mounted) context.push('/mesajlar/${c['id']}');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _report() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ReportSheet(api: _api, listingId: widget.id),
    );
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Şikâyetin alındı, ekibimiz inceleyecek.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = _l;
    return Scaffold(
      appBar: AppBar(
        title: Text(l == null ? 'İlan' : (dealLabels[l.dealType] ?? 'İlan')),
        actions: [
          if (l != null && l.editable)
            IconButton(
              tooltip: 'Düzenle',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () async {
                final changed = await context.push<bool>('/portfoy/${l.id}/duzenle');
                if (changed == true) _load();
              },
            ),
          if (l != null && !l.isOwner && widget.session.me?.role != 'admin')
            PopupMenuButton<String>(
              onSelected: (_) => _report(),
              itemBuilder: (_) => const [PopupMenuItem(value: 'report', child: Text('Bu ilanı şikâyet et'))],
            ),
        ],
      ),
      body: l == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Notice(text: _error.toString(), tone: NoticeTone.error),
                    ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 32),
                children: [
                  _gallery(l),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (l.isOwner) ...[_ownerPanel(l), const SizedBox(height: 16)],
                        Text(formatPrice(l.price, l.dealType),
                            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        Text(l.title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        Text(l.location.format(), style: const TextStyle(color: EmColors.inkSoft)),
                        const SizedBox(height: 12),
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          if (l.eidsVerified) const _Badge('EİDS onaylı', EmColors.ok, Icons.verified_user),
                          if (l.isDemo) const _Badge('Deneme ilanı', EmColors.warn, Icons.science_outlined),
                          if (l.cobrokeShare != null && l.cobrokeShare! > 0)
                            _Badge('Paylaşım %${l.cobrokeShare}', EmColors.brand, Icons.handshake_outlined),
                        ]),
                        const SizedBox(height: 16),
                        _facts(l),
                        if ((l.description ?? '').isNotEmpty) ...[
                          const SizedBox(height: 16),
                          const Text('Açıklama', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          const SizedBox(height: 6),
                          Text(l.description!),
                        ],
                        const SizedBox(height: 16),
                        _ownerCard(l),
                        if (!l.isOwner && l.status == 'active' && widget.session.me?.role != 'admin') ...[
                          const SizedBox(height: 12),
                          _InterestBox(api: _api, listingId: l.id),
                          const SizedBox(height: 10),
                          OutlinedButton.icon(
                            onPressed: _busy != null ? null : _message,
                            icon: const Icon(Icons.chat_bubble_outline),
                            label: const Text('Danışmana mesaj gönder'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _gallery(ListingDetail l) {
    if (l.photos.isEmpty) {
      return AspectRatio(
        aspectRatio: 4 / 3,
        child: Container(
          color: EmColors.paper,
          alignment: Alignment.center,
          child: const Text('Fotoğraf yok', style: TextStyle(color: EmColors.inkSoft)),
        ),
      );
    }
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: Stack(children: [
        PageView.builder(
          itemCount: l.photos.length,
          onPageChanged: (i) => setState(() => _photoIndex = i),
          itemBuilder: (_, i) => AuthImage(api: _api, path: l.photos[i].url),
        ),
        Positioned(
          right: 12,
          bottom: 12,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(99)),
            child: Text('${_photoIndex + 1} / ${l.photos.length}',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          ),
        ),
      ]),
    );
  }

  Widget _facts(ListingDetail l) {
    final rows = <(String, String)>[
      ('Kategori', categoryLabels[l.category] ?? l.category),
      if (l.rooms != null) ('Oda', l.rooms!),
      if (l.grossM2 != null) ('Brüt', '${l.grossM2} m²'),
      if (l.netM2 != null) ('Net', '${l.netM2} m²'),
      if (l.floor != null) ('Kat', l.floor!),
      if (l.buildingAge != null) ('Bina yaşı', '${l.buildingAge}'),
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Column(
          children: [
            for (final (k, v) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  Expanded(child: Text(k, style: const TextStyle(color: EmColors.inkSoft))),
                  Text(v, style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
              ),
          ],
        ),
      ),
    );
  }

  Widget _ownerCard(ListingDetail l) => Card(
        child: ListTile(
          onTap: () => context.push('/danisman/${l.ownerId}'),
          leading: CircleAvatar(
            backgroundColor: EmColors.paper,
            child: Text((l.ownerName ?? '?').characters.first,
                style: const TextStyle(fontWeight: FontWeight.w800, color: EmColors.ink)),
          ),
          title: Row(children: [
            Flexible(child: Text(l.ownerName ?? '—', style: const TextStyle(fontWeight: FontWeight.w700))),
            if (l.ownerVerified)
              const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Icon(Icons.verified, size: 16, color: EmColors.verified),
              ),
          ]),
          subtitle: Text(l.ownerOfficeName ?? 'Bağımsız Danışman'),
          trailing: const Icon(Icons.chevron_right),
        ),
      );

  Widget _ownerPanel(ListingDetail l) {
    final status = l.status;
    final canPublish = status == 'draft' || status == 'passive';
    final eids = l.eidsStatus ?? (l.eidsVerified ? 'verified' : 'unverified');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              const Expanded(
                  child: Text('İlan yönetimi', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
              _Badge(listingStatusLabels[status] ?? status,
                  status == 'active' ? EmColors.ok : EmColors.inkSoft, null),
            ]),
            if (status == 'removed') ...[
              const SizedBox(height: 10),
              Notice(
                tone: NoticeTone.error,
                title: 'İlan yönetici tarafından kaldırıldı',
                text: l.removedReason ?? 'Ayrıntı için destek ekibiyle iletişime geç.',
              ),
            ],
            const SizedBox(height: 14),
            // Fotoğraflar
            Text('Fotoğraflar (${l.photos.length})', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            SizedBox(
              height: 86,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final (i, p) in l.photos.indexed)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: l.editable ? () => _photoMenu(p, i == 0) : null,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Stack(children: [
                            SizedBox(width: 86, height: 86, child: AuthImage(api: _api, path: p.url)),
                            if (i == 0)
                              Positioned(
                                left: 4,
                                bottom: 4,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  color: Colors.black54,
                                  child: const Text('Kapak',
                                      style: TextStyle(color: Colors.white, fontSize: 10)),
                                ),
                              ),
                          ]),
                        ),
                      ),
                    ),
                  if (l.editable)
                    InkWell(
                      onTap: _busy != null ? null : _addPhotos,
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        width: 86,
                        decoration: BoxDecoration(
                          border: Border.all(color: EmColors.line),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: _busy == 'photo'
                            ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.add_a_photo_outlined, color: EmColors.inkSoft),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            // EİDS
            Row(children: [
              const Expanded(child: Text('EİDS yetki doğrulaması', style: TextStyle(fontWeight: FontWeight.w600))),
              Text(eidsLabels[eids] ?? eids,
                  style: TextStyle(
                      color: eids == 'verified'
                          ? EmColors.ok
                          : eids == 'failed'
                              ? EmColors.brand
                              : EmColors.inkSoft,
                      fontWeight: FontWeight.w700)),
            ]),
            Text('Taşınmaz no: ${l.propertyNumber ?? '—'}',
                style: const TextStyle(color: EmColors.inkSoft, fontSize: 13)),
            if (l.eidsMessage != null)
              Text(l.eidsMessage!, style: const TextStyle(color: EmColors.inkSoft, fontSize: 13)),
            if (l.editable && eids != 'verified' && eids != 'pending') ...[
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: l.propertyNumber == null || _busy != null
                    ? null
                    : () => _act('eids', () => _api.post<Object?>('/listings/${l.id}/eids-verify'),
                        done: 'Doğrulama isteği gönderildi'),
                child: Text(l.propertyNumber == null ? 'Önce düzenle ekranından taşınmaz no gir' : 'EİDS ile doğrula'),
              ),
            ],
            const SizedBox(height: 16),
            if (canPublish && status != 'removed')
              BusyButton(
                label: 'Yayına al',
                busy: _busy == 'publish',
                onPressed: _busy != null
                    ? null
                    : () => _act('publish', () => _api.post<Object?>('/listings/${l.id}/publish'),
                        done: 'İlan yayında'),
              ),
            if (status == 'active') ...[
              OutlinedButton(
                onPressed: _busy != null
                    ? null
                    : () => _act('passive', () => _api.post<Object?>('/listings/${l.id}/deactivate'),
                        done: 'İlan pasife alındı'),
                child: const Text('Pasife al'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _busy != null
                    ? null
                    : () async {
                        if (await _confirm('Satıldı / kiralandı',
                            'İlan kapanır ve akışta görünmez. Bu işlem geri alınamaz.', 'İşaretle')) {
                          await _act('sold', () => _api.post<Object?>('/listings/${l.id}/sold'));
                        }
                      },
                child: Text(l.dealType == 'rent' ? 'Kiralandı olarak işaretle' : 'Satıldı olarak işaretle'),
              ),
            ],
            if (status == 'draft') ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: _busy != null ? null : _delete,
                style: TextButton.styleFrom(foregroundColor: EmColors.brand),
                child: const Text('Taslağı sil'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _photoMenu(ListingPhoto p, bool isCover) {
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (!isCover)
            ListTile(
              leading: const Icon(Icons.star_outline),
              title: const Text('Kapak fotoğrafı yap'),
              onTap: () {
                Navigator.pop(ctx);
                _makeCover(p);
              },
            ),
          ListTile(
            leading: const Icon(Icons.delete_outline, color: EmColors.brand),
            title: const Text('Fotoğrafı kaldır'),
            onTap: () {
              Navigator.pop(ctx);
              _removePhoto(p);
            },
          ),
        ]),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.text, this.color, this.icon);
  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: color), const SizedBox(width: 4)],
          Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
        ]),
      );
}

/// "İlgileniyorum" kutusu: açık ilgi varsa durumunu gösterir.
class _InterestBox extends StatefulWidget {
  const _InterestBox({required this.api, required this.listingId});
  final ApiClient api;
  final String listingId;

  @override
  State<_InterestBox> createState() => _InterestBoxState();
}

class _InterestBoxState extends State<_InterestBox> {
  InterestItem? _interest;
  bool _loaded = false;
  bool _busy = false;
  final _note = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await widget.api.get<Map<String, dynamic>>('/listings/${widget.listingId}/interest');
      final i = res['interest'] as Map<String, dynamic>?;
      setState(() {
        _interest = i == null ? null : InterestItem.fromJson(i);
        _loaded = true;
      });
    } catch (_) {
      setState(() => _loaded = true);
    }
  }

  Future<void> _run(Future<Object?> Function() call) async {
    setState(() => _busy = true);
    try {
      await call();
      await _load();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const SizedBox.shrink();
    final i = _interest;
    if (i != null && (i.status == 'pending' || i.status == 'accepted')) {
      return Notice(
        tone: i.status == 'accepted' ? NoticeTone.ok : NoticeTone.info,
        title: i.status == 'accepted' ? 'Eşleştiniz' : 'İlgini ilettin',
        text: i.status == 'accepted'
            ? 'İlan sahibi ilgini kabul etti. Mesajlar bölümünden konuşabilirsiniz.'
            : 'İlan sahibi yanıt verdiğinde bildirim alacaksın.',
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Bu ilanla ilgileniyor musun?', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            TextField(
              controller: _note,
              maxLength: 300,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Not (isteğe bağlı)', counterText: ''),
            ),
            const SizedBox(height: 8),
            BusyButton(
              label: 'İlgileniyorum',
              busy: _busy,
              onPressed: () => _run(() => widget.api.post<Object?>(
                    '/listings/${widget.listingId}/interest',
                    data: {if (_note.text.trim().isNotEmpty) 'note': _note.text.trim()},
                  )),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet({required this.api, required this.listingId});
  final ApiClient api;
  final String listingId;

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  static const reasons = {
    'misleading': 'Yanıltıcı bilgi / fotoğraf',
    'wrong_price': 'Fiyat yanlış',
    'not_available': 'Artık satışta / kirada değil',
    'duplicate': 'Mükerrer ilan',
    'fraud': 'Dolandırıcılık şüphesi',
    'other': 'Diğer',
  };
  String _reason = 'misleading';
  final _note = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      await widget.api.post<Object?>('/listings/${widget.listingId}/report', data: {
        'reason': _reason,
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showError(context, e);
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('İlanı şikâyet et', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          RadioGroup<String>(
            groupValue: _reason,
            onChanged: (v) => setState(() => _reason = v ?? _reason),
            child: Column(children: [
              for (final e in reasons.entries)
                RadioListTile<String>(
                  value: e.key,
                  title: Text(e.value),
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                ),
            ]),
          ),
          TextField(
            controller: _note,
            maxLength: 500,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Açıklama (isteğe bağlı)'),
          ),
          const SizedBox(height: 8),
          BusyButton(label: 'Gönder', busy: _busy, onPressed: _send),
        ],
      ),
    );
  }
}
