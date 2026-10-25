import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

class VerificationScreen extends StatefulWidget {
  const VerificationScreen({super.key, required this.session});
  final Session session;

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  Verification? _data;
  Object? _loadError;
  bool _saving = false;
  bool _submitting = false;
  /// Yüklenmekte olan evrak türü
  String? _uploadingType;

  final _license = TextEditingController();
  final _business = TextEditingController();
  final _city = TextEditingController();
  final _district = TextEditingController();
  final _bio = TextEditingController();

  ApiClient get _api => widget.session.api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_license, _business, _city, _district, _bio]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final v = Verification.fromJson(
        await _api.get<Map<String, dynamic>>('/agents/me/verification'),
      );
      _license.text = v.licenseNumber ?? '';
      _business.text = v.businessName ?? '';
      _city.text = v.city ?? '';
      _district.text = v.district ?? '';
      _bio.text = v.bio ?? '';
      setState(() {
        _data = v;
        _loadError = null;
      });
    } catch (e) {
      setState(() => _loadError = e);
    }
  }

  Future<void> _apply(Map<String, dynamic> json) async {
    final next = Verification.fromJson(json);
    final statusChanged = next.status != _data?.status;
    setState(() => _data = next);
    if (statusChanged) await widget.session.reloadMe();
  }

  Future<void> _saveProfile() async {
    setState(() => _saving = true);
    try {
      final body = <String, dynamic>{
        if (_license.text.trim().isNotEmpty) 'licenseNumber': _license.text.trim(),
        if (_business.text.trim().isNotEmpty) 'businessName': _business.text.trim(),
        if (_city.text.trim().isNotEmpty) 'city': _city.text.trim(),
        if (_district.text.trim().isNotEmpty) 'district': _district.text.trim(),
        'bio': _bio.text.trim(),
      };
      await _apply(await _api.patch<Map<String, dynamic>>('/agents/me/profile', data: body));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Bilgiler kaydedildi')));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _upload(String type) async {
    // İptal edilirse boş liste döner.
    final picked = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'webp'],
    );
    final file = picked.isEmpty ? null : picked.first;
    if (file?.path == null) return;
    if (file!.size > 10 * 1024 * 1024) {
      if (mounted) showError(context, 'Dosya en fazla 10 MB olabilir');
      return;
    }

    setState(() => _uploadingType = type);
    try {
      final form = FormData.fromMap({
        'type': type,
        'file': await MultipartFile.fromFile(file.path!, filename: file.name),
      });
      await _apply(await _api.post<Map<String, dynamic>>('/agents/me/documents', data: form));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _uploadingType = null);
    }
  }

  Future<void> _remove(VerificationDoc d) async {
    try {
      await _apply(await _api.delete<Map<String, dynamic>>('/agents/me/documents/${d.id}'));
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      await _apply(await _api.post<Map<String, dynamic>>('/agents/me/submit'));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: const Text('Onay başvurusu')),
      body: d == null
          ? Center(
              child: _loadError == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Notice(text: _loadError.toString(), tone: NoticeTone.error),
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
                  Align(alignment: Alignment.centerLeft, child: StatusChip(d.status)),
                  const SizedBox(height: 12),
                  ..._statusNotice(d),
                  _section('Yetki belgesi bilgileri', [
                    _field(_license, 'Yetki belgesi numarası', d.editable),
                    _field(_business, 'İşletme unvanı', d.editable),
                    Row(children: [
                      Expanded(child: _field(_city, 'İl', d.editable)),
                      const SizedBox(width: 10),
                      Expanded(child: _field(_district, 'İlçe', d.editable)),
                    ]),
                    _field(_bio, 'Kısa tanıtım (isteğe bağlı)', d.editable, maxLines: 3),
                    if (d.editable)
                      OutlinedButton(
                        onPressed: _saving ? null : _saveProfile,
                        child: Text(_saving ? 'Kaydediliyor…' : 'Kaydet'),
                      ),
                  ]),
                  const SizedBox(height: 16),
                  _section('Belgeler', [
                    const Text(
                      'Yöneticinin istediği belgeler aşağıda. PDF, JPG, PNG, BMP veya WEBP · en fazla 10 MB.',
                      style: TextStyle(color: EmColors.inkSoft, fontSize: 13),
                    ),
                    for (final t in _types(d)) _docType(d, t),
                  ]),
                  if (d.editable) ...[
                    const SizedBox(height: 16),
                    _submitCard(d),
                  ],
                ],
              ),
            ),
    );
  }

  /// Yönetici listesi + listede olmayan ama yüklenmiş türler
  List<DocumentTypeDef> _types(Verification d) {
    final list = [...d.documentTypes];
    if (list.isEmpty) {
      list.add(const DocumentTypeDef(key: 'authority_certificate', label: 'Yetki belgesi', required: true));
    }
    for (final doc in d.documents) {
      if (!list.any((t) => t.key == doc.type)) {
        list.add(DocumentTypeDef(key: doc.type, label: d.typeLabel(doc.type), required: false));
      }
    }
    return list;
  }

  Widget _docType(Verification d, DocumentTypeDef t) {
    final docs = d.documents.where((x) => x.type == t.key).toList();
    final done = docs.isNotEmpty;
    final uploading = _uploadingType == t.key;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: done ? EmColors.ok.withValues(alpha: 0.4) : EmColors.line),
        color: done ? EmColors.okTint.withValues(alpha: 0.35) : null,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(done ? Icons.check_circle : Icons.description_outlined,
              size: 20, color: done ? EmColors.ok : EmColors.inkSoft),
          const SizedBox(width: 8),
          Expanded(
            child: Text(t.label, style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: t.required ? EmColors.brandTint : EmColors.paper,
              borderRadius: BorderRadius.circular(99),
            ),
            child: Text(t.required ? 'Zorunlu' : 'İsteğe bağlı',
                style: TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w700, color: t.required ? EmColors.brand : EmColors.inkSoft)),
          ),
          const SizedBox(width: 6),
        ]),
        if (t.description != null && t.description!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 28, top: 4, right: 6),
            child: Text(t.description!, style: const TextStyle(fontSize: 12, color: EmColors.inkSoft)),
          ),
        for (final doc in docs)
          ListTile(
            dense: true,
            contentPadding: const EdgeInsets.only(left: 20),
            leading: Icon(doc.originalName.toLowerCase().endsWith('.pdf') ? Icons.picture_as_pdf_outlined : Icons.image_outlined),
            title: Text(doc.originalName, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${(doc.sizeBytes / 1024).round()} KB'),
            trailing: d.editable
                ? IconButton(tooltip: 'Kaldır', icon: const Icon(Icons.close_rounded), onPressed: () => _remove(doc))
                : null,
          ),
        if (d.editable)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: _uploadingType != null ? null : () => _upload(t.key),
              icon: uploading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(done ? Icons.add_rounded : Icons.upload_file_rounded),
              label: Text(uploading ? 'Yükleniyor…' : done ? 'Bir dosya daha ekle' : 'Dosya seç ve yükle'),
            ),
          )
        else
          const SizedBox(height: 6),
      ]),
    );
  }

  List<Widget> _statusNotice(Verification d) {
    final n = switch (d.status) {
      VerificationStatus.pending => const Notice(
          tone: NoticeTone.warn,
          title: 'Başvurun incelemede',
          text: 'İnceleme sürerken bilgiler değiştirilemez.',
        ),
      VerificationStatus.rejected => Notice(
          tone: NoticeTone.error,
          title: 'Başvurun reddedildi',
          text: 'Gerekçe: ${d.rejectionReason ?? '—'}\nDüzeltip yeniden gönderebilirsin.',
        ),
      VerificationStatus.approved => const Notice(
          tone: NoticeTone.ok,
          title: 'Onaylı danışmansın',
          text: 'Profilinde onay rozeti görünüyor.',
        ),
      VerificationStatus.draft => null,
    };
    return n == null ? [] : [n, const SizedBox(height: 16)];
  }

  Widget _section(String title, List<Widget> children) => Card(
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

  Widget _field(TextEditingController c, String label, bool enabled, {int maxLines = 1}) => TextField(
        controller: c,
        enabled: enabled,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label),
      );

  Widget _submitCard(Verification d) => Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(color: EmColors.ink, borderRadius: BorderRadius.circular(18)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('İncelemeye gönder',
                style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              d.missing.isEmpty
                  ? 'Her şey hazır. Gönderdikten sonra inceleme bitene kadar bilgiler kilitlenir.'
                  : 'Eksikler: ${d.missing.map(d.missingLabel).join(', ')}',
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 14),
            BusyButton(
              label: 'Başvuruyu gönder',
              busy: _submitting,
              onPressed: d.missing.isEmpty ? _submit : null,
            ),
          ],
        ),
      );
}
