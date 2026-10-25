import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../../widgets/profile_avatar.dart';
import '../session.dart';

/// Profil resmi: fotoğraf yükle, hazır avatar seç veya kaldır.
class AvatarScreen extends StatefulWidget {
  const AvatarScreen({super.key, required this.session});
  final Session session;

  @override
  State<AvatarScreen> createState() => _AvatarScreenState();
}

class _AvatarScreenState extends State<AvatarScreen> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => _busy = true);
    try {
      await fn();
      await widget.session.reloadMe();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _upload() async {
    final picked = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'bmp', 'webp'],
    );
    final file = picked.isEmpty ? null : picked.first;
    if (file?.path == null) return;
    if (file!.size > 5 * 1024 * 1024) {
      if (mounted) showError(context, 'Fotoğraf en fazla 5 MB olabilir');
      return;
    }
    await _run(() async {
      final form = FormData.fromMap({'file': await MultipartFile.fromFile(file.path!, filename: file.name)});
      await widget.session.api.post<void>('/me/avatar', data: form);
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) {
        final me = widget.session.me!;
        final a = me.avatar;
        return Scaffold(
          appBar: AppBar(title: const Text('Profil resmi')),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: [
              Center(child: ProfileAvatar(api: widget.session.api, avatar: a, name: me.fullName, radius: 56)),
              const SizedBox(height: 12),
              const Text(
                'Fotoğrafın profilinde, ilanlarında ve mesajlarda görünür.',
                textAlign: TextAlign.center,
                style: TextStyle(color: EmColors.inkSoft),
              ),
              const SizedBox(height: 20),
              Row(children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _upload,
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Fotoğraf yükle'),
                  ),
                ),
                if (a != null) ...[
                  const SizedBox(width: 10),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _run(() => widget.session.api.delete<void>('/me/avatar')),
                    icon: const Icon(Icons.close_rounded),
                    label: const Text('Kaldır'),
                  ),
                ],
              ]),
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('JPG, PNG, BMP veya WEBP · en fazla 5 MB',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: EmColors.inkSoft)),
              ),
              const SizedBox(height: 28),
              const Text('veya hazır bir avatar seç', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 4,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 14,
                crossAxisSpacing: 14,
                children: [
                  for (final id in avatarPresetIds)
                    Semantics(
                      button: true,
                      selected: a?.kind == 'preset' && a?.preset == id,
                      label: 'Avatar $id',
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: _busy
                            ? null
                            : () => _run(() => widget.session.api.put<void>('/me/avatar', data: {'preset': id})),
                        child: Container(
                          padding: const EdgeInsets.all(3),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: a?.kind == 'preset' && a?.preset == id ? EmColors.brand : Colors.transparent,
                              width: 2.5,
                            ),
                          ),
                          child: ProfileAvatar(
                            api: widget.session.api,
                            avatar: AvatarData(kind: 'preset', preset: id),
                            radius: 30,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              if (_busy) const Padding(padding: EdgeInsets.only(top: 20), child: Center(child: CircularProgressIndicator())),
            ],
          ),
        );
      },
    );
  }
}
