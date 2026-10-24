import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.session});
  final Session session;

  @override
  Widget build(BuildContext context) {
    final me = session.me!;
    return Scaffold(
      appBar: AppBar(
        title: const EmLogo(size: 22),
        actions: [
          IconButton(
            tooltip: 'Çıkış',
            icon: const Icon(Icons.logout_rounded),
            onPressed: session.logout,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: session.reloadMe,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Row(
              children: [
                Flexible(
                  child: Text(
                    'Merhaba ${me.firstName}',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                ),
                if (me.isVerified) ...[
                  const SizedBox(width: 8),
                  const Icon(Icons.verified, color: EmColors.verified, semanticLabel: 'Onaylı danışman'),
                ],
              ],
            ),
            const SizedBox(height: 20),
            if (me.isAgent) _AgentCard(status: me.verificationStatus!) else const _ConsumerCard(),
          ],
        ),
      ),
    );
  }
}

class _AgentCard extends StatelessWidget {
  const _AgentCard({required this.status});
  final VerificationStatus status;

  @override
  Widget build(BuildContext context) {
    final (tone, title, text, cta) = switch (status) {
      VerificationStatus.draft => (
          NoticeTone.info,
          'Onaylı danışman rozeti için başvurunu tamamla',
          'Yetki belgesi bilgilerini ve belgeni yükle.',
          'Başvuruya devam et',
        ),
      VerificationStatus.pending => (
          NoticeTone.warn,
          'Başvurun incelemede',
          'Ekibimiz belgelerini kontrol ediyor.',
          'Başvuruyu görüntüle',
        ),
      VerificationStatus.rejected => (
          NoticeTone.error,
          'Başvurunda düzeltme gerekiyor',
          'Gerekçeyi inceleyip yeniden gönderebilirsin.',
          'Düzelt ve gönder',
        ),
      VerificationStatus.approved => (
          NoticeTone.ok,
          'Onaylı danışmansın',
          'Portföy paylaşımı ve eşleşme yakında açılacak.',
          'Başvuru detayları',
        ),
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Danışman onayı', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                StatusChip(status),
              ],
            ),
            const SizedBox(height: 16),
            Notice(tone: tone, title: title, text: text),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: EmColors.ink),
              onPressed: () => context.push('/basvuru'),
              child: Text(cta),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConsumerCard extends StatelessWidget {
  const _ConsumerCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(20),
        child: Text(
          'Portföyleri görüntüleme ve doğrulanmış danışmanlara talep bırakma özellikleri yakında burada.',
          style: TextStyle(color: EmColors.inkSoft),
        ),
      ),
    );
  }
}
