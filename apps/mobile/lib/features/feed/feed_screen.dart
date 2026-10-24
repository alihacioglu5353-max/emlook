import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/listings.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/listing_tile.dart';
import '../session.dart';
import '../agents/follow_button.dart';

/// Akış: Emlook Ağı (tüm görünür ilanlar) ve Benim Ağım (takip + ofis).
class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key, required this.session});
  final Session session;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  String _scope = 'all';
  String? _dealType;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const EmLogo(size: 22),
        actions: [
          IconButton(
            tooltip: 'Kaydedilenler',
            icon: const Icon(Icons.bookmark_border),
            onPressed: () => context.push('/kaydedilenler'),
          ),
          ListenableBuilder(
            listenable: widget.session,
            builder: (context, _) => IconButton(
              tooltip: 'Bildirimler',
              onPressed: () => context.push('/bildirimler'),
              icon: Badge(
                isLabelVisible: widget.session.unreadCount > 0,
                backgroundColor: EmColors.brand,
                label: Text(widget.session.unreadCount > 9 ? '9+' : '${widget.session.unreadCount}'),
                child: const Icon(Icons.notifications_none_rounded),
              ),
            ),
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'all', label: Text('Emlook Ağı')),
              ButtonSegment(value: 'network', label: Text('Benim Ağım')),
            ],
            selected: {_scope},
            onSelectionChanged: (s) => setState(() => _scope = s.first),
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              for (final (value, label) in const [(null, 'Tümü'), ('sale', 'Satılık'), ('rent', 'Kiralık')])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(label),
                    selected: _dealType == value,
                    onSelected: (_) => setState(() => _dealType = value),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: CursorListingList(
            api: widget.session.api,
            path: '/feed',
            query: {'scope': _scope, if (_dealType != null) 'dealType': _dealType, 'limit': 12},
            empty: _scope == 'network'
                ? 'Ağındaki danışmanların ilanları burada görünür. Danışman takip ederek başla.'
                : 'Henüz gösterilecek ilan yok.',
            header: _scope == 'network' ? _Suggestions(session: widget.session) : null,
          ),
        ),
      ]),
    );
  }
}

/// Takip önerileri (Benim Ağım sekmesinin üstünde)
class _Suggestions extends StatefulWidget {
  const _Suggestions({required this.session});
  final Session session;

  @override
  State<_Suggestions> createState() => _SuggestionsState();
}

class _SuggestionsState extends State<_Suggestions> {
  List<PersonCard>? _people;

  @override
  void initState() {
    super.initState();
    widget.session.api.get<List<dynamic>>('/me/suggestions').then((list) {
      if (mounted) {
        setState(() => _people = list.map((e) => PersonCard.fromJson(e as Map<String, dynamic>)).toList());
      }
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final people = _people;
    if (people == null || people.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Takip edebileceğin danışmanlar', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          SizedBox(
            height: 150,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: people.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final p = people[i];
                return SizedBox(
                  width: 160,
                  child: Card(
                    child: InkWell(
                      onTap: () => context.push('/danisman/${p.id}'),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Flexible(
                                child: Text(p.fullName ?? '—',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontWeight: FontWeight.w700)),
                              ),
                              if (p.isVerified)
                                const Padding(
                                  padding: EdgeInsets.only(left: 4),
                                  child: Icon(Icons.verified, size: 14, color: EmColors.verified),
                                ),
                            ]),
                            const SizedBox(height: 4),
                            Text(p.subtitle,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: EmColors.inkSoft, fontSize: 12)),
                            const Spacer(),
                            FollowButton(
                              api: widget.session.api,
                              agentId: p.id,
                              following: p.followedByMe,
                              compact: true,
                              onChanged: (f, _) => p.followedByMe = f,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
