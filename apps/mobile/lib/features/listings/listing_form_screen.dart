import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/listings.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/search_picker.dart';
import '../session.dart';

/// Yeni ilan (taslak) veya mevcut ilanı düzenleme. [id] null ise oluşturur.
class ListingFormScreen extends StatefulWidget {
  const ListingFormScreen({super.key, required this.session, this.id});
  final Session session;
  final String? id;

  @override
  State<ListingFormScreen> createState() => _ListingFormScreenState();
}

class _ListingFormScreenState extends State<ListingFormScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _gross = TextEditingController();
  final _net = TextEditingController();
  final _rooms = TextEditingController();
  final _floor = TextEditingController();
  final _age = TextEditingController();
  final _propertyNumber = TextEditingController();

  String _dealType = 'sale';
  String _category = 'apartment';
  String _visibility = 'public';
  double _share = 50;
  bool _isDemo = false;
  bool _eidsLocked = false;

  String? _cityCode;
  int? _districtId;
  int? _neighbourhoodId;
  List<PickerOption<String>> _cities = [];
  List<PickerOption<int>> _districts = [];
  List<PickerOption<int>> _neighbourhoods = [];

  bool _loading = true;
  bool _saving = false;
  Object? _error;

  ApiClient get _api => widget.session.api;
  bool get _editing => widget.id != null;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    for (final c in [_title, _description, _price, _gross, _net, _rooms, _floor, _age, _propertyNumber]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _init() async {
    try {
      _cities = await widget.session.locations.cities();
      if (_editing) {
        final l = ListingDetail.fromJson(await _api.get<Map<String, dynamic>>('/listings/${widget.id}'));
        _dealType = l.dealType;
        _category = l.category;
        _visibility = l.visibility;
        _share = (l.cobrokeShare ?? 0).toDouble();
        _isDemo = l.isDemo;
        _title.text = l.title;
        _description.text = l.description ?? '';
        _price.text = groupThousands(l.price);
        _gross.text = l.grossM2?.toString() ?? '';
        _net.text = l.netM2?.toString() ?? '';
        _rooms.text = l.rooms ?? '';
        _floor.text = l.floor ?? '';
        _age.text = l.buildingAge?.toString() ?? '';
        _propertyNumber.text = l.propertyNumber ?? '';
        _eidsLocked = l.eidsVerified;
        _cityCode = l.cityCode;
        _districtId = l.districtId;
        _neighbourhoodId = l.neighbourhoodId;
        _districts = await widget.session.locations.districts(l.cityCode);
        _neighbourhoods = await widget.session.locations.neighbourhoods(l.districtId);
      }
      setState(() => _loading = false);
    } catch (e) {
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _pickCity(String? code) async {
    setState(() {
      _cityCode = code;
      _districtId = null;
      _neighbourhoodId = null;
      _districts = [];
      _neighbourhoods = [];
    });
    if (code != null) {
      final d = await widget.session.locations.districts(code);
      if (mounted) setState(() => _districts = d);
    }
  }

  Future<void> _pickDistrict(int? id) async {
    setState(() {
      _districtId = id;
      _neighbourhoodId = null;
      _neighbourhoods = [];
    });
    if (id != null) {
      final n = await widget.session.locations.neighbourhoods(id);
      if (mounted) setState(() => _neighbourhoods = n);
    }
  }

  int? _int(TextEditingController c) {
    final t = c.text.replaceAll('.', '').trim();
    return t.isEmpty ? null : int.tryParse(t);
  }

  String? _text(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    if (_cityCode == null || _districtId == null) {
      showError(context, 'İl ve ilçe seçin');
      return;
    }
    setState(() => _saving = true);
    final body = <String, dynamic>{
      'dealType': _dealType,
      'category': _category,
      'title': _title.text.trim(),
      'description': _text(_description),
      'price': _int(_price),
      'grossM2': _int(_gross),
      'netM2': _int(_net),
      'rooms': _text(_rooms),
      'floor': _text(_floor),
      'buildingAge': _int(_age),
      'cityCode': _cityCode,
      'districtId': _districtId,
      'neighbourhoodId': _neighbourhoodId,
      'cobrokeShare': _share.round(),
      'visibility': _visibility,
      'isDemo': _isDemo,
      if (!_eidsLocked && _text(_propertyNumber) != null) 'propertyNumber': _text(_propertyNumber),
    };
    // Yeni ilanda boş alanlar gönderilmez; düzenlemede null alanı temizler.
    if (!_editing) body.removeWhere((_, v) => v == null);
    try {
      final res = _editing
          ? await _api.patch<Map<String, dynamic>>('/listings/${widget.id}', data: body)
          : await _api.post<Map<String, dynamic>>('/listings', data: body);
      if (!mounted) return;
      if (_editing) {
        context.pop(true);
      } else {
        // Taslak oluştu: fotoğraf ve yayın için detaya geç
        context.pushReplacement('/ilan/${res['id']}');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_editing ? 'İlanı düzenle' : 'Yeni ilan')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Padding(padding: const EdgeInsets.all(24), child: Notice(text: _error.toString(), tone: NoticeTone.error))
              : Form(
                  key: _form,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                    children: [
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(value: 'sale', label: Text('Satılık')),
                          ButtonSegment(value: 'rent', label: Text('Kiralık')),
                        ],
                        selected: {_dealType},
                        onSelectionChanged: (s) => setState(() => _dealType = s.first),
                      ),
                      const SizedBox(height: 14),
                      DropdownButtonFormField<String>(
                        initialValue: _category,
                        decoration: const InputDecoration(labelText: 'Kategori'),
                        items: categoryLabels.entries
                            .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                            .toList(),
                        onChanged: (v) => setState(() => _category = v ?? _category),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _title,
                        maxLength: 120,
                        decoration: const InputDecoration(labelText: 'Başlık', counterText: ''),
                        validator: (v) => (v ?? '').trim().length < 5 ? 'En az 5 karakter' : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _price,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                        decoration: InputDecoration(
                            labelText: _dealType == 'rent' ? 'Aylık kira (₺)' : 'Fiyat (₺)'),
                        validator: (v) => (_int(_price) ?? 0) < 1 ? 'Fiyat girin' : null,
                      ),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(child: _numField(_gross, 'Brüt m²')),
                        const SizedBox(width: 10),
                        Expanded(child: _numField(_net, 'Net m²')),
                      ]),
                      const SizedBox(height: 12),
                      Row(children: [
                        Expanded(
                          child: TextFormField(
                            controller: _rooms,
                            decoration: const InputDecoration(labelText: 'Oda (3+1)'),
                            validator: (v) {
                              final t = (v ?? '').trim();
                              if (t.isEmpty) return null;
                              return RegExp(r'^(\d{1,2}(\+\d{1,2})?|Stüdyo)$').hasMatch(t) ? null : '3+1 biçiminde';
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: TextFormField(
                            controller: _floor,
                            maxLength: 20,
                            decoration: const InputDecoration(labelText: 'Kat', counterText: ''),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: _numField(_age, 'Bina yaşı')),
                      ]),
                      const SizedBox(height: 18),
                      const Text('Konum', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 8),
                      SearchPickerField<String>(
                        label: 'İl',
                        options: _cities,
                        value: _cityCode,
                        onChanged: _pickCity,
                      ),
                      const SizedBox(height: 12),
                      SearchPickerField<int>(
                        label: 'İlçe',
                        options: _districts,
                        value: _districtId,
                        enabled: _cityCode != null,
                        onChanged: _pickDistrict,
                      ),
                      const SizedBox(height: 12),
                      SearchPickerField<int>(
                        label: 'Mahalle (isteğe bağlı)',
                        options: _neighbourhoods,
                        value: _neighbourhoodId,
                        enabled: _districtId != null,
                        allowClear: true,
                        onChanged: (v) => setState(() => _neighbourhoodId = v),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _description,
                        maxLines: 6,
                        maxLength: 5000,
                        decoration: const InputDecoration(labelText: 'Açıklama', alignLabelWithHint: true),
                      ),
                      const SizedBox(height: 12),
                      const Text('Paylaşım', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      Text('Bu ilanı satan/kiralayan meslektaşına komisyonun %${_share.round()}\'i',
                          style: const TextStyle(color: EmColors.inkSoft)),
                      Slider(
                        value: _share,
                        max: 100,
                        divisions: 20,
                        label: '%${_share.round()}',
                        onChanged: (v) => setState(() => _share = v),
                      ),
                      const SizedBox(height: 4),
                      const Text('Kimler görebilir?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      RadioGroup<String>(
                        groupValue: _visibility,
                        onChanged: (v) => setState(() => _visibility = v ?? _visibility),
                        child: Column(children: [
                          for (final e in visibilityLabels.entries)
                            RadioListTile<String>(
                              value: e.key,
                              title: Text(e.value.$1),
                              subtitle: Text(e.value.$2),
                              contentPadding: EdgeInsets.zero,
                            ),
                        ]),
                      ),
                      const SizedBox(height: 8),
                      const Text('EİDS', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 4),
                      const Text(
                        'Mülk sahibinin e-Devlet\'te seni yetkilendirdiği taşınmaz numarası. Yayın için EİDS onayı gerekir.',
                        style: TextStyle(color: EmColors.inkSoft, fontSize: 13),
                      ),
                      const SizedBox(height: 8),
                      TextFormField(
                        controller: _propertyNumber,
                        enabled: !_eidsLocked,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        validator: (v) {
                          final t = (v ?? '').trim();
                          return t.isEmpty || RegExp(r'^\d{5,20}$').hasMatch(t) ? null : '5-20 haneli rakam';
                        },
                        decoration: InputDecoration(
                          labelText: 'Taşınmaz numarası',
                          helperText: _eidsLocked ? 'Doğrulanmış numara değiştirilemez' : null,
                        ),
                      ),
                      SwitchListTile(
                        value: _isDemo,
                        onChanged: (v) => setState(() => _isDemo = v),
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Deneme ilanı'),
                        subtitle: const Text('EİDS doğrulaması olmadan yayınlanır, "Deneme" etiketi taşır'),
                      ),
                      const SizedBox(height: 16),
                      BusyButton(
                        label: _editing ? 'Kaydet' : 'Taslak oluştur',
                        busy: _saving,
                        onPressed: _save,
                      ),
                      if (!_editing)
                        const Padding(
                          padding: EdgeInsets.only(top: 10),
                          child: Text('Sonraki adımda fotoğraf ekleyip yayına alabilirsin.',
                              textAlign: TextAlign.center, style: TextStyle(color: EmColors.inkSoft)),
                        ),
                    ],
                  ),
                ),
    );
  }

  Widget _numField(TextEditingController c, String label) => TextFormField(
        controller: c,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: InputDecoration(labelText: label),
      );
}
