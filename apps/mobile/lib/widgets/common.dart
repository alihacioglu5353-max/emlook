import 'package:flutter/material.dart';

import '../core/models.dart';
import '../core/theme.dart';

class EmLogo extends StatelessWidget {
  const EmLogo({super.key, this.size = 26});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.home_rounded, color: EmColors.brand, size: size + 4),
        const SizedBox(width: 6),
        Text(
          'emlook',
          style: TextStyle(
            fontSize: size,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.8,
            color: EmColors.ink,
          ),
        ),
      ],
    );
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final VerificationStatus status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      VerificationStatus.draft => (EmColors.paper, EmColors.inkSoft),
      VerificationStatus.pending => (EmColors.warnTint, EmColors.warn),
      VerificationStatus.approved => (EmColors.okTint, EmColors.ok),
      VerificationStatus.rejected => (EmColors.brandTint, EmColors.brand),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
        border: status == VerificationStatus.draft ? Border.all(color: EmColors.line) : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (status == VerificationStatus.approved) ...[
            Icon(Icons.verified, size: 14, color: fg),
            const SizedBox(width: 4),
          ],
          Text(status.label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

enum NoticeTone { info, ok, warn, error }

class Notice extends StatelessWidget {
  const Notice({super.key, required this.text, this.title, this.tone = NoticeTone.info});
  final String? title;
  final String text;
  final NoticeTone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      NoticeTone.info => (EmColors.paper, EmColors.ink),
      NoticeTone.ok => (EmColors.okTint, EmColors.ok),
      NoticeTone.warn => (EmColors.warnTint, EmColors.warn),
      NoticeTone.error => (EmColors.brandTint, EmColors.brand),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: tone == NoticeTone.info ? Border.all(color: EmColors.line) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(title!, style: TextStyle(color: fg, fontWeight: FontWeight.w700)),
            ),
          Text(text, style: TextStyle(color: fg)),
        ],
      ),
    );
  }
}

/// Uzun işlemlerde düğmeyi kilitleyip dönen gösterge gösterir.
class BusyButton extends StatelessWidget {
  const BusyButton({super.key, required this.label, required this.onPressed, this.busy = false});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      child: busy
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
            )
          : Text(label),
    );
  }
}

void showError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(error.toString()), backgroundColor: EmColors.brand),
  );
}

class RoleChip extends StatelessWidget {
  const RoleChip(this.role, {super.key});
  final OfficeRole role;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (role) {
      OfficeRole.owner => (EmColors.brand, Colors.white),
      OfficeRole.manager => (EmColors.ink, Colors.white),
      OfficeRole.agent => (EmColors.paper, EmColors.inkSoft),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
        border: role == OfficeRole.agent ? Border.all(color: EmColors.line) : null,
      ),
      child: Text(role.label, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800)),
    );
  }
}

/// "3 dk önce", "dün" gibi kısa göreli zaman
String timeAgo(DateTime t, [DateTime? now]) {
  final d = (now ?? DateTime.now()).difference(t);
  if (d.inMinutes < 1) return 'az önce';
  if (d.inHours < 1) return '${d.inMinutes} dk önce';
  if (d.inDays < 1) return '${d.inHours} sa önce';
  if (d.inDays == 1) return 'dün';
  if (d.inDays < 7) return '${d.inDays} gün önce';
  final l = t.toLocal();
  return '${l.day.toString().padLeft(2, '0')}.${l.month.toString().padLeft(2, '0')}.${l.year}';
}
