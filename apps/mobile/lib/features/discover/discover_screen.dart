import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/listings.dart';
import '../../core/theme.dart';
import '../../widgets/auth_image.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// Keşfet: sağa kaydır = ilgileniyorum (el sıkışma), sola = geç.
class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key, required this.session});
  final Session session;

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> with SingleTickerProviderStateMixin {
  final _queue = <ListingCard>[];
  String? _dealType;
  bool _loading = false;
  bool _exhausted = false;
  bool _canUndo = false;
  bool _busy = false;
  Object? _error;

  Offset _drag = Offset.zero;
  late final AnimationController _anim =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  Animation<Offset>? _flyOut;

  @override
  void initState() {
    super.initState();
    _anim.addListener(() {
      if (_flyOut != null) setState(() => _drag = _flyOut!.value);
    });
    _fetch();
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  Future<void> _fetch({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      if (reset) {
        _queue.clear();
        _exhausted = false;
      }
    });
    try {
      final res = await widget.session.api.get<Map<String, dynamic>>('/discover', query: {
        if (_dealType != null) 'dealType': _dealType,
        'limit': 15,
      });
      final items = (res['items'] as List).map((e) => ListingCard.fromJson(e as Map<String, dynamic>)).toList();
      final known = _queue.map((l) => l.id).toSet();
      setState(() {
        _queue.addAll(items.where((l) => !known.contains(l.id)));
        _exhausted = items.isEmpty;
        _canUndo = res['canUndo'] as bool? ?? _canUndo;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decide(String decision) async {
    if (_busy || _queue.isEmpty) return;
    final current = _queue.first;
    setState(() => _busy = true);
    final width = MediaQuery.of(context).size.width;
    _flyOut = Tween<Offset>(begin: _drag, end: Offset(decision == 'like' ? width * 1.5 : -width * 1.5, _drag.dy))
        .animate(CurvedAnimation(parent: _anim, curve: Curves.easeOut));
    final fly = _anim.forward(from: 0);
    try {
      await widget.session.api.post<Object?>('/discover/${current.id}/swipe', data: {'decision': decision});
      await fly;
      setState(() {
        _queue.removeAt(0);
        _canUndo = true;
      });
      if (decision == 'like' && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('İlgin iletildi. Kabul edilirse eşleşirsiniz.'), duration: Duration(seconds: 2)),
        );
      }
      if (_queue.length < 4 && !_exhausted) _fetch();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      _flyOut = null;
      _anim.reset();
      if (mounted) {
        setState(() {
          _drag = Offset.zero;
          _busy = false;
        });
      }
    }
  }

  Future<void> _undo() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final res = await widget.session.api.post<Map<String, dynamic>>('/discover/undo');
      final restored = res['restored'] as Map<String, dynamic>?;
      setState(() {
        _canUndo = res['canUndo'] as bool? ?? false;
        if (restored != null) _queue.insert(0, ListingCard.fromJson(restored));
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Keşfet'),
        actions: [
          TextButton.icon(
            onPressed: () => context.push('/talepler'),
            icon: const Icon(Icons.handshake_outlined, size: 18),
            label: const Text('Talepler'),
          ),
        ],
      ),
      body: Column(children: [
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            children: [
              for (final (value, label) in const [(null, 'Tümü'), ('sale', 'Satılık'), ('rent', 'Kiralık')])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(label),
                    selected: _dealType == value,
                    onSelected: (_) {
                      setState(() => _dealType = value);
                      _fetch(reset: true);
                    },
                  ),
                ),
            ],
          ),
        ),
        Expanded(child: _body()),
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
            _RoundButton(
              icon: Icons.close_rounded,
              color: EmColors.inkSoft,
              tooltip: 'Geç',
              onTap: _queue.isEmpty || _busy ? null : () => _decide('pass'),
            ),
            _RoundButton(
              icon: Icons.undo_rounded,
              color: EmColors.warn,
              small: true,
              tooltip: 'Geri al',
              onTap: _canUndo && !_busy ? _undo : null,
            ),
            _RoundButton(
              icon: Icons.favorite_rounded,
              color: EmColors.brand,
              tooltip: 'İlgileniyorum',
              onTap: _queue.isEmpty || _busy ? null : () => _decide('like'),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _body() {
    if (_queue.isEmpty) {
      if (_loading) return const Center(child: CircularProgressIndicator());
      if (_error != null) {
        return Padding(padding: const EdgeInsets.all(24), child: Notice(text: _error.toString(), tone: NoticeTone.error));
      }
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.travel_explore, size: 48, color: EmColors.line),
            const SizedBox(height: 12),
            const Text('Şimdilik hepsi bu kadar', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 4),
            const Text('Yeni ilanlar geldikçe burada göreceksin.',
                textAlign: TextAlign.center, style: TextStyle(color: EmColors.inkSoft)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: () => _fetch(reset: true), child: const Text('Yenile')),
          ]),
        ),
      );
    }

    final width = MediaQuery.of(context).size.width;
    final progress = (_drag.dx / (width * 0.4)).clamp(-1.0, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Stack(children: [
        if (_queue.length > 1)
          Positioned.fill(
            child: Transform.scale(
              scale: 0.95 + 0.05 * progress.abs(),
              child: _DiscoverCard(session: widget.session, listing: _queue[1]),
            ),
          ),
        Positioned.fill(
          child: GestureDetector(
            onPanUpdate: _busy ? null : (d) => setState(() => _drag += d.delta),
            onPanEnd: _busy
                ? null
                : (d) {
                    if (_drag.dx > width * 0.28 || d.velocity.pixelsPerSecond.dx > 900) {
                      _decide('like');
                    } else if (_drag.dx < -width * 0.28 || d.velocity.pixelsPerSecond.dx < -900) {
                      _decide('pass');
                    } else {
                      setState(() => _drag = Offset.zero);
                    }
                  },
            onTap: () => context.push('/ilan/${_queue.first.id}'),
            child: Transform.translate(
              offset: _drag,
              child: Transform.rotate(
                angle: progress * math.pi / 24,
                child: Stack(children: [
                  _DiscoverCard(session: widget.session, listing: _queue.first),
                  if (progress.abs() > 0.15)
                    Positioned(
                      top: 24,
                      left: progress > 0 ? 24 : null,
                      right: progress < 0 ? 24 : null,
                      child: Opacity(
                        opacity: progress.abs(),
                        child: _Stamp(like: progress > 0),
                      ),
                    ),
                ]),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

class _DiscoverCard extends StatelessWidget {
  const _DiscoverCard({required this.session, required this.listing});
  final Session session;
  final ListingCard listing;

  @override
  Widget build(BuildContext context) {
    final l = listing;
    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 2,
      child: Stack(fit: StackFit.expand, children: [
        AuthImage(api: session.api, path: l.coverPhoto),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.transparent, Colors.black87],
              stops: [0.45, 1],
            ),
          ),
        ),
        Positioned(
          left: 18,
          right: 18,
          bottom: 18,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(formatPrice(l.price, l.dealType),
                style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
            Text(l.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text('${l.summary}\n${l.location.format()}', style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 8),
            Row(children: [
              Flexible(
                child: Text([l.ownerName, l.ownerOffice].whereType<String>().join(' · '),
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70)),
              ),
              if (l.ownerVerified)
                const Padding(
                  padding: EdgeInsets.only(left: 4),
                  child: Icon(Icons.verified, size: 16, color: Colors.white),
                ),
              const Spacer(),
              if (l.cobrokeShare != null && l.cobrokeShare! > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: EmColors.brand, borderRadius: BorderRadius.circular(99)),
                  child: Text('Paylaşım %${l.cobrokeShare}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                ),
            ]),
          ]),
        ),
      ]),
    );
  }
}

class _Stamp extends StatelessWidget {
  const _Stamp({required this.like});
  final bool like;

  @override
  Widget build(BuildContext context) {
    final c = like ? EmColors.ok : EmColors.brand;
    return Transform.rotate(
      angle: like ? -0.2 : 0.2,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          border: Border.all(color: c, width: 3),
          borderRadius: BorderRadius.circular(8),
          color: Colors.white.withValues(alpha: 0.85),
        ),
        child: Text(like ? 'İLGİLENİYORUM' : 'GEÇ',
            style: TextStyle(color: c, fontWeight: FontWeight.w900, fontSize: 20)),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.color, required this.tooltip, this.onTap, this.small = false});
  final IconData icon;
  final Color color;
  final String tooltip;
  final VoidCallback? onTap;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final s = small ? 52.0 : 66.0;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: EmColors.surface,
        shape: CircleBorder(side: BorderSide(color: onTap == null ? EmColors.line : color.withValues(alpha: 0.4))),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: s,
            height: s,
            child: Icon(icon, color: onTap == null ? EmColors.line : color, size: small ? 24 : 32),
          ),
        ),
      ),
    );
  }
}
