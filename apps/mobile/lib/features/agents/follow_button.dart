import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

/// Danışman takip düğmesi. [onChanged] yeni durum ve takipçi sayısını verir.
class FollowButton extends StatefulWidget {
  const FollowButton({
    super.key,
    required this.api,
    required this.agentId,
    required this.following,
    this.onChanged,
    this.compact = false,
  });

  final ApiClient api;
  final String agentId;
  final bool following;
  final void Function(bool following, int followerCount)? onChanged;
  final bool compact;

  @override
  State<FollowButton> createState() => _FollowButtonState();
}

class _FollowButtonState extends State<FollowButton> {
  late bool _following = widget.following;
  bool _busy = false;

  @override
  void didUpdateWidget(FollowButton old) {
    super.didUpdateWidget(old);
    if (old.following != widget.following) _following = widget.following;
  }

  Future<void> _toggle() async {
    setState(() => _busy = true);
    try {
      final path = '/agents/${widget.agentId}/follow';
      final res = _following
          ? await widget.api.delete<Map<String, dynamic>>(path)
          : await widget.api.post<Map<String, dynamic>>(path);
      final f = res['followedByMe'] as bool? ?? !_following;
      setState(() => _following = f);
      widget.onChanged?.call(f, (res['followerCount'] as num?)?.toInt() ?? 0);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.compact ? const Size(0, 36) : const Size.fromHeight(44);
    final child = _busy
        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
        : Text(_following ? 'Takip ediliyor' : 'Takip et');
    return _following
        ? OutlinedButton(
            onPressed: _busy ? null : _toggle,
            style: OutlinedButton.styleFrom(minimumSize: size),
            child: child,
          )
        : FilledButton(
            onPressed: _busy ? null : _toggle,
            style: FilledButton.styleFrom(minimumSize: size, backgroundColor: EmColors.ink),
            child: child,
          );
  }
}
