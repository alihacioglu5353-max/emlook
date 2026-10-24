import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/listings.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/listing_tile.dart';
import '../../widgets/search_picker.dart';
import '../session.dart';

/// Arama: "Kadıköy 3+1 satılık 10 milyon altı" gibi serbest metin + filtreler.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, required this.session});
  final Session session;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  static const _page = 20;
  final _text = TextEditingController();
  final _scroll = ScrollController();

  /// Açık filtreler (ayrıştırılan değerlerin önüne geçer)
  final Map<String, String> _filters = {};
  String _q = '';
  String _sort = 'new';

  final _items = <ListingCard>[];
  int? _nextOffset = 0;
  int _total = 0;
  List<String> _chips = [];
  bool _loading = false;
  Object? _error;
  bool _searched = false;

  List<PersonCard> _agents = [];

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 600) _more();
    });
  }

  @override
  void dispose() {
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _q = _text.text.trim();
      _items.clear();
      _nextOffset = 0;
      _searched = true;
      _error = null;
    });
    if (_q.length >= 2) {
      widget.session.api.get<List<dynamic>>('/search/agents', query: {'q': _q}).then((list) {
        if (mounted) {
          setState(() => _agents = list.map((e) => PersonCard.fromJson(e as Map<String, dynamic>)).toList());
        }
      }).catchError((_) {});
    } else {
      _agents = [];
    }
    await _more();
  }

  Future<void> _more() async {
    if (_loading || _nextOffset == null || !_searched) return;
    setState(() => _loading = true);
    try {
      final res = await widget.session.api.get<Map<String, dynamic>>('/search', query: {
        if (_q.isNotEmpty) 'q': _q,
        ..._filters,
        if (_sort != 'new') 'sort': _sort,
        'limit': _page,
        'offset': _nextOffset,
      });
      setState(() {
        _items.addAll((res['items'] as List).map((e) => ListingCard.fromJson(e as Map<String, dynamic>)));
        _nextOffset = (res['nextOffset'] as num?)?.toInt();
        _total = (res['total'] as num?)?.toInt() ?? _items.length;
        _chips = _chipsOf(res['parsed'] as Map<String, dynamic>?);
      });
    } catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<String> _chipsOf(Map<String, dynamic>? p) {
    if (p == null) return [];
    final chips = <String>[];
    final city = p['city'] as Map<String, dynamic>?;
    final district = p['district'] as Map<String, dynamic>?;
    if (district != null) {
      chips.add('${district['name']}${city != null ? ', ${city['name']}' : ''}');
    } else if (city != null) {
      chips.add(city['name'] as String);
    }
    if (p['dealType'] != null) chips.add(dealLabels[p['dealType']]!);
    if (p['category'] != null) chips.add(categoryLabels[p['category']] ?? '${p['category']}');
    if (p['rooms'] != null) chips.add('${p['rooms']}');
    final minP = p['minPrice'] as num?, maxP = p['maxPrice'] as num?;
    if (minP != null && maxP != null) {
      chips.add('${formatPrice(minP)} – ${formatPrice(maxP)}');
    } else if (maxP != null) {
      chips.add('en fazla ${formatPrice(maxP)}');
    } else if (minP != null) {
      chips.add('en az ${formatPrice(minP)}');
    }
    final minA = p['minM2'] as num?, maxA = p['maxM2'] as num?;
    if (minA != null && maxA != null) {
      chips.add('$minA–$maxA m²');
    } else if (minA != null) {
      chips.add('$minA+ m²');
    } else if (maxA != null) {
      chips.add('en çok $maxA m²');
    }
    for (final t in (p['text'] as List? ?? const [])) {
      chips.add('"$t"');
    }
    return chips;
  }

  Future<void> _openFilters() async {
    final next = await showModalBottomSheet<Map<String, String>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FilterSheet(session: widget.session, initial: Map.of(_filters)),
    );
    if (next != null) {
      setState(() {
        _filters
          ..clear()
          ..addAll(next);
      });
      _search();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ara')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _text,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _search(),
                decoration: InputDecoration(
                  hintText: 'Kadıköy 3+1 satılık 10 milyon altı',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _search),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: 'Filtreler',
              onPressed: _openFilters,
              icon: Badge(
                isLabelVisible: _filters.isNotEmpty,
                label: Text('${_filters.length}'),
                child: const Icon(Icons.tune),
              ),
            ),
          ]),
        ),
        Expanded(child: _results()),
      ]),
    );
  }

  Widget _results() {
    if (!_searched) {
      return ListView(padding: const EdgeInsets.all(24), children: const [
        SizedBox(height: 40),
        Icon(Icons.manage_search, size: 52, color: EmColors.line),
        SizedBox(height: 12),
        Text('Aradığını yazman yeterli', textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        SizedBox(height: 6),
        Text('Konum, oda sayısı, satılık/kiralık ve bütçeyi tek cümlede anlıyoruz. Danışman adı veya ofis de arayabilirsin.',
            textAlign: TextAlign.center, style: TextStyle(color: EmColors.inkSoft)),
      ]);
    }
    return RefreshIndicator(
      onRefresh: _search,
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        itemCount: _items.length + 2,
        itemBuilder: (context, i) {
          if (i == 0) return _header();
          if (i <= _items.length) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: ListingTile(api: widget.session.api, listing: _items[i - 1]),
            );
          }
          if (_error != null) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: Notice(text: _error.toString(), tone: NoticeTone.error),
            );
          }
          if (_loading) {
            return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
          }
          if (_items.isEmpty) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Text('Bu aramayla eşleşen ilan bulunamadı.',
                  textAlign: TextAlign.center, style: TextStyle(color: EmColors.inkSoft)),
            );
          }
          return const SizedBox(height: 8);
        },
      ),
    );
  }

  Widget _header() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_chips.isNotEmpty) ...[
            const Text('Anladığım', style: TextStyle(color: EmColors.inkSoft, fontSize: 12)),
            const SizedBox(height: 4),
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final c in _chips)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: EmColors.brandTint, borderRadius: BorderRadius.circular(99)),
                  child: Text(c, style: const TextStyle(color: EmColors.brand, fontWeight: FontWeight.w600)),
                ),
            ]),
            const SizedBox(height: 10),
          ],
          if (_agents.isNotEmpty) ...[
            const Text('Danışmanlar', style: TextStyle(fontWeight: FontWeight.w700)),
            for (final a in _agents.take(3))
              ListTile(
                contentPadding: EdgeInsets.zero,
                onTap: () => context.push('/danisman/${a.id}'),
                leading: CircleAvatar(
                  backgroundColor: EmColors.paper,
                  child: Text((a.fullName ?? '?').characters.first,
                      style: const TextStyle(color: EmColors.ink, fontWeight: FontWeight.w800)),
                ),
                title: Row(children: [
                  Flexible(child: Text(a.fullName ?? '—')),
                  if (a.isVerified)
                    const Padding(
                      padding: EdgeInsets.only(left: 4),
                      child: Icon(Icons.verified, size: 14, color: EmColors.verified),
                    ),
                ]),
                subtitle: Text(a.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            const SizedBox(height: 8),
          ],
          Row(children: [
            Expanded(
              child: Text(_loading && _items.isEmpty ? 'Aranıyor…' : '$_total ilan',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
            DropdownButton<String>(
              value: _sort,
              underline: const SizedBox.shrink(),
              items: const [
                DropdownMenuItem(value: 'new', child: Text('En yeni')),
                DropdownMenuItem(value: 'price_asc', child: Text('Fiyat artan')),
                DropdownMenuItem(value: 'price_desc', child: Text('Fiyat azalan')),
              ],
              onChanged: (v) {
                setState(() => _sort = v ?? 'new');
                _search();
              },
            ),
          ]),
          const SizedBox(height: 6),
        ],
      );
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.session, required this.initial});
  final Session session;
  final Map<String, String> initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late final Map<String, String> _f = widget.initial;
  List<PickerOption<String>> _cities = [];
  List<PickerOption<int>> _districts = [];
  late final _minPrice = TextEditingController(text: _f['minPrice']);
  late final _maxPrice = TextEditingController(text: _f['maxPrice']);

  @override
  void initState() {
    super.initState();
    widget.session.locations.cities().then((c) {
      if (mounted) setState(() => _cities = c);
    });
    final city = _f['cityCode'];
    if (city != null) {
      widget.session.locations.districts(city).then((d) {
        if (mounted) setState(() => _districts = d);
      });
    }
  }

  @override
  void dispose() {
    _minPrice.dispose();
    _maxPrice.dispose();
    super.dispose();
  }

  void _set(String key, String? value) => setState(() {
        if (value == null || value.isEmpty) {
          _f.remove(key);
        } else {
          _f[key] = value;
        }
      });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Filtreler', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              for (final (v, l) in const [(null, 'Tümü'), ('sale', 'Satılık'), ('rent', 'Kiralık')])
                ChoiceChip(
                  label: Text(l),
                  selected: _f['dealType'] == v,
                  onSelected: (_) => _set('dealType', v),
                ),
            ]),
            const SizedBox(height: 12),
            SearchPickerField<String>(
              label: 'İl',
              options: _cities,
              value: _f['cityCode'],
              allowClear: true,
              onChanged: (code) async {
                _set('cityCode', code);
                _set('districtId', null);
                setState(() => _districts = []);
                if (code != null) {
                  final d = await widget.session.locations.districts(code);
                  if (mounted) setState(() => _districts = d);
                }
              },
            ),
            const SizedBox(height: 12),
            SearchPickerField<int>(
              label: 'İlçe',
              options: _districts,
              value: int.tryParse(_f['districtId'] ?? ''),
              enabled: _f['cityCode'] != null,
              allowClear: true,
              onChanged: (id) => _set('districtId', id?.toString()),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _f['category'],
              decoration: const InputDecoration(labelText: 'Kategori'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Tümü')),
                for (final e in categoryLabels.entries) DropdownMenuItem<String?>(value: e.key, child: Text(e.value)),
              ],
              onChanged: (v) => _set('category', v),
            ),
            const SizedBox(height: 12),
            const Text('Oda', style: TextStyle(fontWeight: FontWeight.w600)),
            Wrap(spacing: 6, children: [
              for (final r in const [null, '1+1', '2+1', '3+1', '4+1', '5+1'])
                ChoiceChip(
                  label: Text(r ?? 'Tümü'),
                  selected: _f['rooms'] == r,
                  onSelected: (_) => _set('rooms', r),
                ),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _num(_minPrice, 'En az ₺', 'minPrice')),
              const SizedBox(width: 10),
              Expanded(child: _num(_maxPrice, 'En çok ₺', 'maxPrice')),
            ]),
            const SizedBox(height: 18),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(context, <String, String>{}),
                  child: const Text('Temizle'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: () => Navigator.pop(context, _f),
                  child: const Text('Uygula'),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget _num(TextEditingController c, String label, String key) => TextField(
        controller: c,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        decoration: InputDecoration(labelText: label),
        onChanged: (v) => _set(key, v),
      );
}
