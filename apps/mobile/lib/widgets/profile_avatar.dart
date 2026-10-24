import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/theme.dart';
import 'auth_image.dart';

/// Hazır avatarlar (p01–p12)
const _presetColors = [
  Color(0xFFC8283F), Color(0xFF2F7DE1), Color(0xFF1F8A5B), Color(0xFFA8670A),
  Color(0xFF7A4CC2), Color(0xFF0E8C8C), Color(0xFFD9653B), Color(0xFF3D5A80),
  Color(0xFFB83280), Color(0xFF4F7A28), Color(0xFF5B5D66), Color(0xFF8C5A2B),
];
const _presetIcons = [
  Icons.person, Icons.face, Icons.emoji_people, Icons.sentiment_satisfied_alt,
  Icons.home_work, Icons.apartment, Icons.villa, Icons.key,
  Icons.star, Icons.eco, Icons.handshake, Icons.location_city,
];

/// Profil resmi: fotoğraf, hazır avatar ya da baş harf.
class ProfileAvatar extends StatelessWidget {
  const ProfileAvatar({super.key, required this.api, this.avatar, this.name, this.radius = 20});
  final ApiClient api;
  final AvatarData? avatar;
  final String? name;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final a = avatar;
    final size = radius * 2;
    if (a?.kind == 'photo' && a?.url != null) {
      return ClipOval(child: SizedBox(width: size, height: size, child: AuthImage(api: api, path: a!.url)));
    }
    if (a?.kind == 'preset' && a?.preset != null) {
      final i = ((int.tryParse(a!.preset!.substring(1)) ?? 1) - 1).clamp(0, 11);
      return CircleAvatar(
        radius: radius,
        backgroundColor: _presetColors[i],
        child: Icon(_presetIcons[i], color: Colors.white, size: radius * 1.1),
      );
    }
    final n = (name ?? '').trim();
    return CircleAvatar(
      radius: radius,
      backgroundColor: EmColors.paper,
      child: Text(n.isEmpty ? '?' : n.characters.first.toUpperCase(),
          style: TextStyle(fontSize: radius * 0.8, fontWeight: FontWeight.w800, color: EmColors.ink)),
    );
  }
}

/// Rozet tanımları `/settings/public` üzerinden yönetici panelinde belirlenir.
class BadgeTiers {
  static final Map<String, String> labels = {
    'new': 'Yeni Danışman',
    'bronze': 'Bronz',
    'silver': 'Gümüş',
    'gold': 'Altın',
    'platinum': 'Platin',
  };
  static bool _loaded = false;

  static Future<void> load(ApiClient api) async {
    if (_loaded) return;
    try {
      final res = await api.get<Map<String, dynamic>>('/settings/public');
      for (final t in (res['badgeTiers'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>()) {
        labels[t['key'] as String] = t['label'] as String;
      }
      _loaded = true;
    } catch (_) {
      // Varsayılan adlarla devam edilir
    }
  }
}

const _badgeStyle = {
  'new': (Color(0xFFEFECE7), EmColors.inkSoft),
  'bronze': (Color(0xFFF6E7DA), Color(0xFF8C5A2B)),
  'silver': (Color(0xFFECEEF2), Color(0xFF5B6475)),
  'gold': (Color(0xFFFBF0D2), Color(0xFF9A6B00)),
  'platinum': (EmColors.brandTint, EmColors.brand),
};

/// Danışman rozeti (puana göre). Rozet yoksa hiçbir şey çizmez.
class BadgeChip extends StatelessWidget {
  const BadgeChip(this.badge, {super.key, this.small = false});
  final String? badge;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final b = badge;
    if (b == null) return const SizedBox.shrink();
    final (bg, fg) = _badgeStyle[b] ?? (EmColors.paper, EmColors.inkSoft);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: small ? 6 : 8, vertical: small ? 1 : 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.workspace_premium, size: small ? 11 : 14, color: fg),
        const SizedBox(width: 3),
        Text(BadgeTiers.labels[b] ?? b,
            style: TextStyle(fontSize: small ? 10 : 12, fontWeight: FontWeight.w700, color: fg)),
      ]),
    );
  }
}
