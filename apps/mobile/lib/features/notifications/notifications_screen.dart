import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.session});
  final Session session;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<AppNotification>? _items;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.session.api.get<Map<String, dynamic>>(
        '/notifications',
        query: {'limit': 50},
      );
      setState(() {
        _items = (res['items'] as List)
            .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
            .toList();
        _error = null;
      });
      await widget.session.refreshUnread();
    } catch (e) {
      setState(() => _error = e);
    }
  }

  Future<void> _open(AppNotification n) async {
    if (!n.read) {
      try {
        await widget.session.api.post<Map<String, dynamic>>('/notifications/${n.id}/read');
      } catch (_) {}
      await _load();
    }
    final route = n.route;
    if (route != null && mounted) context.push(route);
  }

  Future<void> _readAll() async {
    try {
      await widget.session.api.post<Map<String, dynamic>>('/notifications/read-all');
      await _load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final hasUnread = items?.any((n) => !n.read) ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bildirimler'),
        actions: [
          if (hasUnread) TextButton(onPressed: _readAll, child: const Text('Tümünü okundu say')),
        ],
      ),
      body: items == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Notice(text: _error.toString(), tone: NoticeTone.error),
                    ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: items.isEmpty
                  ? ListView(children: const [
                      SizedBox(height: 120),
                      Center(child: Text('Henüz bildirim yok.', style: TextStyle(color: EmColors.inkSoft))),
                    ])
                  : ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const Divider(height: 1, color: EmColors.line),
                      itemBuilder: (_, i) {
                        final n = items[i];
                        return ListTile(
                          onTap: () => _open(n),
                          leading: Icon(
                            Icons.circle,
                            size: 10,
                            color: n.read ? Colors.transparent : EmColors.brand,
                            semanticLabel: n.read ? null : 'Okunmamış',
                          ),
                          minLeadingWidth: 10,
                          title: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(n.body),
                              const SizedBox(height: 4),
                              Text(timeAgo(n.createdAt),
                                  style: const TextStyle(fontSize: 12, color: EmColors.inkSoft)),
                            ],
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
