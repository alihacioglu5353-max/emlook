import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/messaging.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Konuşmalar listesi (15 sn'de bir yenilenir).
class ConversationsScreen extends StatefulWidget {
  const ConversationsScreen({super.key, required this.session});
  final Session session;

  @override
  State<ConversationsScreen> createState() => _ConversationsScreenState();
}

class _ConversationsScreenState extends State<ConversationsScreen> {
  List<ConversationSummary>? _items;
  Object? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await widget.session.api.get<List<dynamic>>('/conversations');
      if (!mounted) return;
      setState(() {
        _items = list.map((e) => ConversationSummary.fromJson(e as Map<String, dynamic>)).toList();
        _error = null;
      });
      widget.session.refreshUnread();
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return Scaffold(
      appBar: AppBar(title: const Text('Mesajlar')),
      body: items == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(padding: const EdgeInsets.all(24), child: Notice(text: _error.toString(), tone: NoticeTone.error)),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: items.isEmpty
                  ? ListView(children: const [
                      SizedBox(height: 120),
                      Icon(Icons.chat_bubble_outline, size: 48, color: EmColors.line),
                      SizedBox(height: 12),
                      Center(
                        child: Padding(
                          padding: EdgeInsets.symmetric(horizontal: 32),
                          child: Text(
                            'Bir ilandan veya danışman profilinden mesaj gönderebilirsin. Eşleştiğin ilanların konuşmaları da burada açılır.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: EmColors.inkSoft),
                          ),
                        ),
                      ),
                    ])
                  : ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(height: 1, indent: 76, color: EmColors.line),
                      itemBuilder: (_, i) {
                        final c = items[i];
                        final unread = c.unread > 0;
                        return ListTile(
                          onTap: () async {
                            await context.push('/mesajlar/${c.id}');
                            _load();
                          },
                          leading: CircleAvatar(
                            radius: 24,
                            backgroundColor: EmColors.paper,
                            child: Text((c.otherName ?? '?').characters.first,
                                style: const TextStyle(fontWeight: FontWeight.w800, color: EmColors.ink)),
                          ),
                          title: Row(children: [
                            Flexible(
                              child: Text(c.otherName ?? '—',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontWeight: unread ? FontWeight.w800 : FontWeight.w600)),
                            ),
                            if (c.otherVerified)
                              const Padding(
                                padding: EdgeInsets.only(left: 4),
                                child: Icon(Icons.verified, size: 14, color: EmColors.verified),
                              ),
                            const Spacer(),
                            if (c.lastAt != null)
                              Text(timeAgo(c.lastAt!),
                                  style: const TextStyle(fontSize: 12, color: EmColors.inkSoft)),
                          ]),
                          subtitle: Row(children: [
                            Expanded(
                              child: Text(c.preview,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      color: unread ? EmColors.ink : EmColors.inkSoft,
                                      fontWeight: unread ? FontWeight.w600 : FontWeight.w400)),
                            ),
                            if (unread)
                              Container(
                                margin: const EdgeInsets.only(left: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                decoration:
                                    BoxDecoration(color: EmColors.brand, borderRadius: BorderRadius.circular(99)),
                                child: Text('${c.unread}',
                                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                              ),
                          ]),
                        );
                      },
                    ),
            ),
    );
  }
}
