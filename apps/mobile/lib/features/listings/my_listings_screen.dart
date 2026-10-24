import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/listings.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/listing_tile.dart';
import '../session.dart';

/// Portföyüm: duruma göre sekmeler.
class MyListingsScreen extends StatefulWidget {
  const MyListingsScreen({super.key, required this.session});
  final Session session;

  @override
  State<MyListingsScreen> createState() => _MyListingsScreenState();
}

class _MyListingsScreenState extends State<MyListingsScreen> {
  static const _tabs = ['all', 'active', 'draft', 'passive', 'sold'];
  String _tab = 'all';
  List<ListingCard>? _items;
  Map<String, int> _counts = {};
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.session.api.get<Map<String, dynamic>>('/listings/mine', query: {
        'limit': 100,
        if (_tab != 'all') 'status': _tab,
      });
      setState(() {
        _items = (res['items'] as List).map((e) => ListingCard.fromJson(e as Map<String, dynamic>)).toList();
        _counts = (res['counts'] as Map<String, dynamic>).map((k, v) => MapEntry(k, (v as num).toInt()));
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e);
    }
  }

  int get _total => ['draft', 'active', 'passive', 'sold'].fold(0, (s, k) => s + (_counts[k] ?? 0));

  String _label(String t) => t == 'all' ? 'Tümü' : listingStatusLabels[t]!;

  Future<void> _open(String path) async {
    await context.push(path);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final verified = widget.session.me?.isVerified ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Portföyüm')),
      floatingActionButton: verified
          ? FloatingActionButton.extended(
              onPressed: () => _open('/portfoy/yeni'),
              backgroundColor: EmColors.brand,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('Yeni ilan'),
            )
          : null,
      body: Column(children: [
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            children: [
              for (final t in _tabs)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text('${_label(t)} ${t == 'all' ? _total : (_counts[t] ?? 0)}'),
                    selected: _tab == t,
                    onSelected: (_) {
                      setState(() {
                        _tab = t;
                        _items = null;
                      });
                      _load();
                    },
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: !verified
              ? const Padding(
                  padding: EdgeInsets.all(20),
                  child: Notice(
                    tone: NoticeTone.warn,
                    title: 'Önce danışman onayı gerekiyor',
                    text: 'İlan eklemek için onaylı danışman olmalısın.',
                  ),
                )
              : _items == null
                  ? Center(
                      child: _error == null
                          ? const CircularProgressIndicator()
                          : Padding(
                              padding: const EdgeInsets.all(20),
                              child: Notice(text: _error.toString(), tone: NoticeTone.error),
                            ),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: _items!.isEmpty
                          ? ListView(children: const [
                              SizedBox(height: 100),
                              Center(
                                  child: Text('Bu sekmede ilan yok.', style: TextStyle(color: EmColors.inkSoft))),
                            ])
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                              itemCount: _items!.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 14),
                              itemBuilder: (_, i) => ListingTile(
                                api: widget.session.api,
                                listing: _items![i],
                                showOwner: false,
                                showReactions: false,
                                onTap: () => _open('/ilan/${_items![i].id}'),
                              ),
                            ),
                    ),
        ),
      ]),
    );
  }
}
