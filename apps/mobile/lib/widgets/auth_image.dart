import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/theme.dart';

/// Belirteç gerektiren görseller (ilan fotoğrafları) için küçük bellek önbelleği.
class _ImageCache {
  static const _max = 80;
  final _map = <String, Uint8List>{}; // ekleme sırasını korur (LRU)
  final _pending = <String, Future<Uint8List>>{};

  Future<Uint8List> load(ApiClient api, String path) {
    final hit = _map.remove(path);
    if (hit != null) {
      _map[path] = hit; // en son kullanılan sona
      return Future.value(hit);
    }
    return _pending[path] ??= api.bytes(path).then((b) {
      _map[path] = b;
      if (_map.length > _max) _map.remove(_map.keys.first);
      return b;
    }).whenComplete(() => _pending.remove(path));
  }

  Uint8List? peek(String path) => _map[path];

  void evict(String path) => _map.remove(path);
}

final authImageCache = _ImageCache();

/// API'den yetkiyle çekilen görsel. [path] API köküne göre (`/listings/…/photos/…`).
class AuthImage extends StatefulWidget {
  const AuthImage({super.key, required this.api, required this.path, this.fit = BoxFit.cover});
  final ApiClient api;
  final String? path;
  final BoxFit fit;

  @override
  State<AuthImage> createState() => _AuthImageState();
}

class _AuthImageState extends State<AuthImage> {
  Future<Uint8List>? _future;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(AuthImage old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path) _start();
  }

  void _start() {
    final p = widget.path;
    _future = p == null ? null : authImageCache.load(widget.api, p);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.path;
    if (p == null || _future == null) return const _Placeholder(icon: Icons.home_work_outlined);
    final cached = authImageCache.peek(p);
    if (cached != null) return Image.memory(cached, fit: widget.fit, gaplessPlayback: true);
    return FutureBuilder<Uint8List>(
      future: _future,
      builder: (context, snap) {
        if (snap.hasData) return Image.memory(snap.data!, fit: widget.fit, gaplessPlayback: true);
        if (snap.hasError) return const _Placeholder(icon: Icons.broken_image_outlined);
        return const _Placeholder();
      },
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({this.icon});
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        color: EmColors.paper,
        alignment: Alignment.center,
        child: icon == null
            ? const SizedBox.shrink()
            : Icon(icon, color: EmColors.line, size: 36),
      );
}
