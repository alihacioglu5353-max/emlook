import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/listings.dart';
import '../../core/models.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/listing_tile.dart';
import '../session.dart';
import 'follow_button.dart';

/// Danışman profili: ofis, takipçiler ve yayındaki ilanları.
class AgentProfileScreen extends StatefulWidget {
  const AgentProfileScreen({super.key, required this.session, required this.id});
  final Session session;
  final String id;

  @override
  State<AgentProfileScreen> createState() => _AgentProfileScreenState();
}

class _AgentProfileScreenState extends State<AgentProfileScreen> {
  AgentProfile? _p;
  Object? _error;
  bool _messaging = false;

  bool get _isMe => widget.session.me?.id == widget.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = AgentProfile.fromJson(await widget.session.api.get<Map<String, dynamic>>('/agents/${widget.id}'));
      setState(() => _p = p);
    } catch (e) {
      setState(() => _error = e);
    }
  }

  Future<void> _message() async {
    setState(() => _messaging = true);
    try {
      final c = await widget.session.api.post<Map<String, dynamic>>('/conversations', data: {'userId': widget.id});
      if (mounted) context.push('/mesajlar/${c['id']}');
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _messaging = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    return Scaffold(
      appBar: AppBar(title: Text(p?.fullName ?? 'Danışman')),
      body: p == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24), child: Notice(text: _error.toString(), tone: NoticeTone.error)),
            )
          : CursorListingList(
              api: widget.session.api,
              path: '/agents/${widget.id}/listings',
              query: const {'limit': 12},
              empty: 'Yayında ilanı yok.',
              header: _header(p),
            ),
    );
  }

  Widget _header(AgentProfile p) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: EmColors.paper,
                child: Text((p.fullName ?? '?').characters.first,
                    style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: EmColors.ink)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Flexible(
                      child: Text(p.fullName ?? '—',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    ),
                    if (p.isVerified)
                      const Padding(
                        padding: EdgeInsets.only(left: 6),
                        child: Icon(Icons.verified, color: EmColors.verified, semanticLabel: 'Onaylı danışman'),
                      ),
                  ]),
                  const SizedBox(height: 2),
                  Row(children: [
                    Flexible(
                      child: Text(p.officeName ?? 'Bağımsız Danışman',
                          style: const TextStyle(color: EmColors.inkSoft)),
                    ),
                    if (p.officeRole != null) ...[
                      const SizedBox(width: 6),
                      RoleChip(OfficeRole.parse(p.officeRole)),
                    ],
                  ]),
                  if (p.place.isNotEmpty)
                    Text(p.place, style: const TextStyle(color: EmColors.inkSoft, fontSize: 13)),
                ]),
              ),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              _stat('${p.activeListingCount}', 'İlan'),
              _stat('${p.followerCount}', 'Takipçi'),
              _stat('${p.followingCount}', 'Takip'),
            ]),
            if ((p.bio ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(p.bio!),
            ],
            if (!_isMe) ...[
              const SizedBox(height: 14),
              Row(children: [
                Expanded(
                  child: FollowButton(
                    api: widget.session.api,
                    agentId: p.id,
                    following: p.followedByMe,
                    onChanged: (f, count) => setState(() {
                      p.followedByMe = f;
                      p.followerCount = count;
                    }),
                  ),
                ),
                if (widget.session.me?.role != 'admin') ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _messaging ? null : _message,
                      icon: const Icon(Icons.chat_bubble_outline, size: 18),
                      label: const Text('Mesaj'),
                    ),
                  ),
                ],
              ]),
            ],
            const SizedBox(height: 18),
            const Text('Yayındaki ilanlar', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ],
        ),
      );

  Widget _stat(String value, String label) => Expanded(
        child: Column(children: [
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text(label, style: const TextStyle(color: EmColors.inkSoft, fontSize: 12)),
        ]),
      );
}
