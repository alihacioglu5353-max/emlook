import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api_client.dart';
import '../core/listings.dart';
import '../core/theme.dart';
import 'auth_image.dart';

/// Akış, arama, kaydedilenler ve portföyde kullanılan ilan kartı.
class ListingTile extends StatefulWidget {
  const ListingTile({
    super.key,
    required this.api,
    required this.listing,
    this.showOwner = true,
    this.showReactions = true,
    this.onTap,
  });

  final ApiClient api;
  final ListingCard listing;
  final bool showOwner;
  final bool showReactions;
  final VoidCallback? onTap;

  @override
  State<ListingTile> createState() => _ListingTileState();
}

class _ListingTileState extends State<ListingTile> {
  bool _busy = false;

  ListingCard get l => widget.listing;

  Future<void> _toggle(String kind) async {
    if (_busy) return;
    final on = kind == 'like' ? l.likedByMe : l.savedByMe;
    setState(() {
      _busy = true;
      // İyimser güncelleme; hata olursa geri alınır.
      if (kind == 'like') {
        l.likedByMe = !on;
        l.likeCount += on ? -1 : 1;
      } else {
        l.savedByMe = !on;
      }
    });
    try {
      final path = '/listings/${l.id}/$kind';
      final res = on
          ? await widget.api.delete<Map<String, dynamic>>(path)
          : await widget.api.post<Map<String, dynamic>>(path);
      setState(() {
        l.likeCount = (res['likeCount'] as num?)?.toInt() ?? l.likeCount;
        l.likedByMe = res['likedByMe'] as bool? ?? l.likedByMe;
        l.savedByMe = res['savedByMe'] as bool? ?? l.savedByMe;
      });
    } catch (e) {
      setState(() {
        if (kind == 'like') {
          l.likedByMe = on;
          l.likeCount += on ? 1 : -1;
        } else {
          l.savedByMe = on;
        }
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: widget.onTap ?? () => context.push('/ilan/${l.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 10,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  AuthImage(api: widget.api, path: l.coverPhoto),
                  Positioned(
                    left: 10,
                    top: 10,
                    child: Wrap(spacing: 6, children: [
                      _Pill(dealLabels[l.dealType] ?? l.dealType, dark: true),
                      if (l.eidsVerified) const _Pill('EİDS', icon: Icons.verified_user),
                      if (l.isDemo) const _Pill('Deneme'),
                    ]),
                  ),
                  if (l.photoCount > 1)
                    Positioned(
                      right: 10,
                      bottom: 10,
                      child: _Pill('${l.photoCount}', icon: Icons.photo_library_outlined, dark: true),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    formatPrice(l.price, l.dealType),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 2),
                  Text(l.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(l.summary, style: const TextStyle(color: EmColors.inkSoft, fontSize: 13)),
                  Text(l.location.format(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: EmColors.inkSoft, fontSize: 13)),
                  if (l.cobrokeShare != null && l.cobrokeShare! > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('Paylaşım %${l.cobrokeShare}',
                          style: const TextStyle(
                              color: EmColors.brand, fontWeight: FontWeight.w700, fontSize: 13)),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 4, 6),
              child: Row(
                children: [
                  if (widget.showOwner)
                    Expanded(
                      child: Row(children: [
                        Flexible(
                          child: Text(
                            [l.ownerName, l.ownerOffice].whereType<String>().join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12, color: EmColors.inkSoft),
                          ),
                        ),
                        if (l.ownerVerified)
                          const Padding(
                            padding: EdgeInsets.only(left: 4),
                            child: Icon(Icons.verified, size: 14, color: EmColors.verified),
                          ),
                      ]),
                    )
                  else
                    Expanded(
                      child: Text(listingStatusLabels[l.status] ?? l.status,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                  if (widget.showReactions) ...[
                    IconButton(
                      tooltip: l.likedByMe ? 'Beğeniyi kaldır' : 'Beğen',
                      onPressed: () => _toggle('like'),
                      icon: Icon(l.likedByMe ? Icons.favorite : Icons.favorite_border,
                          color: l.likedByMe ? EmColors.brand : EmColors.inkSoft, size: 22),
                    ),
                    if (l.likeCount > 0)
                      Text('${l.likeCount}', style: const TextStyle(color: EmColors.inkSoft)),
                    IconButton(
                      tooltip: l.savedByMe ? 'Kayıttan çıkar' : 'Kaydet',
                      onPressed: () => _toggle('save'),
                      icon: Icon(l.savedByMe ? Icons.bookmark : Icons.bookmark_border,
                          color: l.savedByMe ? EmColors.ink : EmColors.inkSoft, size: 22),
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
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, {this.icon, this.dark = false});
  final String text;
  final IconData? icon;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final fg = dark ? Colors.white : EmColors.ok;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: dark ? Colors.black.withValues(alpha: 0.6) : Colors.white,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 12, color: fg), const SizedBox(width: 3)],
        Text(text, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800)),
      ]),
    );
  }
}

/// İmleçli (cursor) sayfalama ile sonsuz kaydırılan ilan listesi.
class CursorListingList extends StatefulWidget {
  const CursorListingList({
    super.key,
    required this.api,
    required this.path,
    this.query = const {},
    this.empty = 'Gösterilecek ilan yok.',
    this.header,
  });

  final ApiClient api;
  final String path;
  final Map<String, dynamic> query;
  final String empty;
  final Widget? header;

  @override
  State<CursorListingList> createState() => _CursorListingListState();
}

class _CursorListingListState extends State<CursorListingList> {
  final _items = <ListingCard>[];
  String? _cursor;
  bool _done = false;
  bool _loading = false;
  Object? _error;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 600) _more();
    });
    _more();
  }

  @override
  void didUpdateWidget(CursorListingList old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path || old.query.toString() != widget.query.toString()) _reload();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    setState(() {
      _items.clear();
      _cursor = null;
      _done = false;
      _error = null;
    });
    await _more();
  }

  Future<void> _more() async {
    if (_loading || _done) return;
    setState(() => _loading = true);
    try {
      final page = CursorPage.listings(await widget.api.get<Map<String, dynamic>>(
        widget.path,
        query: {...widget.query, if (_cursor != null) 'cursor': _cursor},
      ));
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _done = page.nextCursor == null;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView.builder(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _items.length + 2,
        itemBuilder: (context, i) {
          if (i == 0) return widget.header ?? const SizedBox.shrink();
          if (i <= _items.length) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: ListingTile(api: widget.api, listing: _items[i - 1]),
            );
          }
          if (_error != null) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: Column(children: [
                Text(_error.toString(), textAlign: TextAlign.center,
                    style: const TextStyle(color: EmColors.brand)),
                TextButton(onPressed: _more, child: const Text('Tekrar dene')),
              ]),
            );
          }
          if (_loading) {
            return const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          if (_items.isEmpty) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 64),
              child: Text(widget.empty, textAlign: TextAlign.center,
                  style: const TextStyle(color: EmColors.inkSoft)),
            );
          }
          return const SizedBox(height: 8);
        },
      ),
    );
  }
}
