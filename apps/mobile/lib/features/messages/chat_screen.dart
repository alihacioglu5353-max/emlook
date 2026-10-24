import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/listings.dart';
import '../../core/messaging.dart';
import '../../core/theme.dart';
import '../../widgets/auth_image.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Sohbet. Yeni mesajlar 4 sn'de bir `after` imleciyle yoklanır; yukarı
/// kaydırınca eski mesajlar `cursor` ile yüklenir.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.session, required this.id});
  final Session session;
  final String id;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  ConversationSummary? _summary;

  /// Eskiden yeniye
  final _messages = <ChatMessage>[];
  String? _olderCursor;
  bool _hasOlder = false;
  bool _loadingOlder = false;
  bool _loaded = false;
  Object? _error;

  final _text = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      // Liste ters çevrili: en üst = maxScrollExtent
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 200) _loadOlder();
    });
    _init();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _text.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    try {
      final s = await widget.session.api.get<Map<String, dynamic>>('/conversations/${widget.id}');
      final page = await widget.session.api.get<Map<String, dynamic>>('/conversations/${widget.id}/messages');
      setState(() {
        _summary = ConversationSummary.fromJson(s);
        _messages.addAll(_parse(page));
        _olderCursor = page['nextCursor'] as String?;
        _hasOlder = _olderCursor != null;
        _loaded = true;
      });
      _markRead();
      _poll = Timer.periodic(const Duration(seconds: 4), (_) => _pollNew());
    } catch (e) {
      setState(() {
        _error = e;
        _loaded = true;
      });
    }
  }

  List<ChatMessage> _parse(Map<String, dynamic> page) =>
      (page['items'] as List).map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList();

  Future<void> _loadOlder() async {
    if (_loadingOlder || !_hasOlder) return;
    _loadingOlder = true;
    try {
      final page = await widget.session.api
          .get<Map<String, dynamic>>('/conversations/${widget.id}/messages', query: {'cursor': _olderCursor});
      final older = _parse(page);
      final ids = _messages.map((m) => m.id).toSet();
      setState(() {
        _messages.insertAll(0, older.where((m) => !ids.contains(m.id)));
        _olderCursor = page['nextCursor'] as String?;
        _hasOlder = _olderCursor != null;
      });
    } catch (_) {
      // Sonraki kaydırmada yeniden denenir
    } finally {
      _loadingOlder = false;
    }
  }

  Future<void> _pollNew() async {
    try {
      final last = _messages.isEmpty ? null : _messages.last.cursor;
      final page = await widget.session.api.get<Map<String, dynamic>>(
        '/conversations/${widget.id}/messages',
        query: {'after': ?last},
      );
      _append(_parse(page));
    } catch (_) {
      // Ağ kesintisi: bir sonraki turda yeniden denenir
    }
  }

  void _append(List<ChatMessage> items) {
    if (items.isEmpty || !mounted) return;
    final ids = _messages.map((m) => m.id).toSet();
    final fresh = items.where((m) => !ids.contains(m.id)).toList();
    if (fresh.isEmpty) return;
    setState(() => _messages.addAll(fresh));
    if (fresh.any((m) => !m.mine)) _markRead();
  }

  Future<void> _markRead() async {
    try {
      await widget.session.api.post<Object?>('/conversations/${widget.id}/read');
      widget.session.refreshUnread();
    } catch (_) {}
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final created = await widget.session.api
          .post<List<dynamic>>('/conversations/${widget.id}/messages', data: {'text': body});
      _text.clear();
      _append(created.map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList());
      if (_scroll.hasClients) _scroll.jumpTo(0);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    final canWrite = widget.session.me?.role != 'admin';
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: s == null
            ? const Text('Mesajlar')
            : InkWell(
                onTap: s.otherIsAgent ? () => context.push('/danisman/${s.otherId}') : null,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Flexible(child: Text(s.otherName ?? '—', overflow: TextOverflow.ellipsis)),
                    if (s.otherVerified)
                      const Padding(
                        padding: EdgeInsets.only(left: 4),
                        child: Icon(Icons.verified, size: 16, color: EmColors.verified),
                      ),
                  ]),
                  Text(s.otherIsAgent ? (s.otherOffice ?? 'Bağımsız Danışman') : 'Mülk sahibi',
                      style: const TextStyle(fontSize: 12, color: EmColors.inkSoft)),
                ]),
              ),
      ),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Padding(padding: const EdgeInsets.all(24), child: Notice(text: _error.toString(), tone: NoticeTone.error))
              : Column(children: [
                  Expanded(
                    child: ListView.builder(
                      controller: _scroll,
                      reverse: true,
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                      itemCount: _messages.length,
                      itemBuilder: (_, i) {
                        final m = _messages[_messages.length - 1 - i];
                        return _Bubble(session: widget.session, message: m);
                      },
                    ),
                  ),
                  if (canWrite)
                    SafeArea(
                      top: false,
                      child: Container(
                        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                        decoration: const BoxDecoration(
                          color: EmColors.surface,
                          border: Border(top: BorderSide(color: EmColors.line)),
                        ),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Expanded(
                            child: TextField(
                              controller: _text,
                              minLines: 1,
                              maxLines: 5,
                              maxLength: 2000,
                              textCapitalization: TextCapitalization.sentences,
                              decoration: const InputDecoration(
                                hintText: 'Mesaj yaz',
                                counterText: '',
                                contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          IconButton.filled(
                            tooltip: 'Gönder',
                            onPressed: _sending ? null : _send,
                            style: IconButton.styleFrom(backgroundColor: EmColors.brand),
                            icon: _sending
                                ? const SizedBox(
                                    width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Icon(Icons.send_rounded, color: Colors.white),
                          ),
                        ]),
                      ),
                    ),
                ]),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.session, required this.message});
  final Session session;
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final m = message;
    if (m.kind == 'system') {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: EmColors.okTint, borderRadius: BorderRadius.circular(99)),
            child: Text(m.body,
                textAlign: TextAlign.center, style: const TextStyle(color: EmColors.ok, fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        ),
      );
    }
    final align = m.mine ? CrossAxisAlignment.end : CrossAxisAlignment.start;
    final l = m.listing;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Column(crossAxisAlignment: align, children: [
        if (l != null)
          GestureDetector(
            onTap: () => context.push('/ilan/${l.id}'),
            child: Container(
              width: 240,
              margin: const EdgeInsets.only(bottom: 4),
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: EmColors.surface,
                border: Border.all(color: EmColors.line),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(height: 120, width: 240, child: AuthImage(api: session.api, path: l.coverPhoto)),
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(formatPrice(l.price, l.dealType), style: const TextStyle(fontWeight: FontWeight.w800)),
                    Text(l.title, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ]),
                ),
              ]),
            ),
          ),
        if (m.body.isNotEmpty && m.kind == 'text')
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: m.mine ? EmColors.ink : EmColors.surface,
                border: m.mine ? null : Border.all(color: EmColors.line),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(18),
                  topRight: const Radius.circular(18),
                  bottomLeft: Radius.circular(m.mine ? 18 : 4),
                  bottomRight: Radius.circular(m.mine ? 4 : 18),
                ),
              ),
              child: Text(m.body, style: TextStyle(color: m.mine ? Colors.white : EmColors.ink, fontSize: 15)),
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
          child: Text(_clock(m.createdAt), style: const TextStyle(fontSize: 11, color: EmColors.inkSoft)),
        ),
      ]),
    );
  }

  static String _clock(DateTime t) {
    final l = t.toLocal();
    final now = DateTime.now();
    final hm = '${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
    if (l.year == now.year && l.month == now.month && l.day == now.day) return hm;
    return '${l.day.toString().padLeft(2, '0')}.${l.month.toString().padLeft(2, '0')} $hm';
  }
}
