import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/listings.dart';
import '../../core/theme.dart';
import '../../widgets/auth_image.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Talepler: ilanlarıma gelen ilgiler ve gönderdiğim ilgiler.
class InterestsScreen extends StatelessWidget {
  const InterestsScreen({super.key, required this.session});
  final Session session;

  @override
  Widget build(BuildContext context) {
    final isAgent = session.me?.isAgent ?? false;
    return DefaultTabController(
      length: isAgent ? 2 : 1,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Talepler'),
          bottom: isAgent
              ? const TabBar(tabs: [Tab(text: 'Gelen'), Tab(text: 'Gönderdiğim')])
              : null,
        ),
        body: isAgent
            ? TabBarView(children: [
                _InterestList(session: session, side: 'incoming'),
                _InterestList(session: session, side: 'outgoing'),
              ])
            : _InterestList(session: session, side: 'outgoing'),
      ),
    );
  }
}

class _InterestList extends StatefulWidget {
  const _InterestList({required this.session, required this.side});
  final Session session;
  final String side;

  @override
  State<_InterestList> createState() => _InterestListState();
}

class _InterestListState extends State<_InterestList> with AutomaticKeepAliveClientMixin {
  List<InterestItem>? _items;
  Object? _error;
  String? _busy;

  bool get _incoming => widget.side == 'incoming';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.session.api.get<Map<String, dynamic>>('/interests/${widget.side}');
      setState(() {
        _items = (res['items'] as List).map((e) => InterestItem.fromJson(e as Map<String, dynamic>)).toList();
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e);
    }
  }

  Future<void> _act(InterestItem i, String verb) async {
    setState(() => _busy = '${i.id}:$verb');
    try {
      final res = await widget.session.api.post<Map<String, dynamic>>('/interests/${i.id}/$verb');
      await _load();
      if (verb == 'accept' && mounted) {
        final convo = res['conversationId'] as String?;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('Eşleştiniz! Artık mesajlaşabilirsiniz.'),
          action: convo == null
              ? null
              : SnackBarAction(label: 'Mesajlaş', onPressed: () => context.push('/mesajlar/$convo')),
        ));
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final items = _items;
    if (items == null) {
      return Center(
        child: _error == null
            ? const CircularProgressIndicator()
            : Padding(padding: const EdgeInsets.all(24), child: Notice(text: _error.toString(), tone: NoticeTone.error)),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: items.isEmpty
          ? ListView(children: [
              const SizedBox(height: 100),
              Center(
                child: Text(
                  _incoming ? 'İlanlarına henüz ilgi gelmedi.' : 'Keşfet\'te sağa kaydırdığın ilanlar burada görünür.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: EmColors.inkSoft),
                ),
              ),
            ])
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (_, idx) => _tile(items[idx]),
            ),
    );
  }

  Widget _tile(InterestItem i) {
    final person = _incoming ? i.requesterName : i.ownerName;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          InkWell(
            onTap: () => context.push('/ilan/${i.listingId}'),
            child: Row(children: [
              SizedBox(width: 96, height: 80, child: AuthImage(api: widget.session.api, path: i.listingCover)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(i.listingTitle,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(formatPrice(i.listingPrice, i.listingDealType)),
                  Text(i.listingPlace, style: const TextStyle(color: EmColors.inkSoft, fontSize: 12)),
                ]),
              ),
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: _StatusPill(i.status),
              ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(
                  child: Text(
                    _incoming
                        ? '${person ?? 'Bir kullanıcı'} ${i.requesterIsAgent ? '(danışman)' : '(mülk sahibi)'}'
                        : 'İlan sahibi: ${person ?? '—'}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                if (_incoming && i.requesterVerified)
                  const Padding(
                    padding: EdgeInsets.only(left: 4),
                    child: Icon(Icons.verified, size: 14, color: EmColors.verified),
                  ),
                const Spacer(),
                Text(timeAgo(i.createdAt), style: const TextStyle(color: EmColors.inkSoft, fontSize: 12)),
              ]),
              if ((i.note ?? '').isNotEmpty) ...[
                const SizedBox(height: 4),
                Text('"${i.note}"', style: const TextStyle(color: EmColors.inkSoft)),
              ],
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                if (_incoming && i.status == 'pending') ...[
                  FilledButton(
                    onPressed: _busy != null ? null : () => _act(i, 'accept'),
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                    child: const Text('Kabul et'),
                  ),
                  OutlinedButton(
                    onPressed: _busy != null ? null : () => _act(i, 'decline'),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                    child: const Text('Reddet'),
                  ),
                ],
                if (!_incoming && i.status == 'pending')
                  OutlinedButton(
                    onPressed: _busy != null ? null : () => _act(i, 'withdraw'),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
                    child: const Text('Geri çek'),
                  ),
                if (i.status == 'accepted' && i.conversationId != null)
                  FilledButton.icon(
                    onPressed: () => context.push('/mesajlar/${i.conversationId}'),
                    style: FilledButton.styleFrom(minimumSize: const Size(0, 40), backgroundColor: EmColors.ink),
                    icon: const Icon(Icons.chat_bubble_outline, size: 18),
                    label: const Text('Mesajlaş'),
                  ),
              ]),
            ]),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      'accepted' => (EmColors.okTint, EmColors.ok),
      'pending' => (EmColors.warnTint, EmColors.warn),
      _ => (EmColors.paper, EmColors.inkSoft),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(InterestItem.statusLabels[status] ?? status,
          style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}
