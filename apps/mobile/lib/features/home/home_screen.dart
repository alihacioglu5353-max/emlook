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
    // Oturum değiştikçe (rozet, ofis, okunmamış sayısı) ekran yenilenir.
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        final me = session.me;
        if (me == null) return const Scaffold();
        return Scaffold(
          appBar: AppBar(
            title: const Text('Profil'),
            actions: [
              _Bell(count: session.unreadCount, onTap: () => context.push('/bildirimler')),
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
                if (me.role == 'admin')
                  const Notice(
                    title: 'Yönetici hesabı',
                    text: 'Başvuru, ofis, ilan ve ödeme yönetimi Emlook web panelinden yapılır.',
                  )
                else if (me.isAgent) ...[
                  _AgentCard(status: me.verificationStatus!),
                  const SizedBox(height: 16),
                  _OfficeCard(me: me),
                ] else
                  const _ConsumerCard(),
                const SizedBox(height: 16),
                _Menu(items: [
                  if (me.isAgent) ...[
                    (Icons.home_work_outlined, 'Portföyüm', '/portfoy'),
                    (Icons.account_balance_wallet_outlined, 'Ödemeler', '/odemeler'),
                  ],
                  if (me.role != 'admin') (Icons.handshake_outlined, 'Talepler', '/talepler'),
                  (Icons.bookmark_border, 'Kaydedilenler', '/kaydedilenler'),
                  (Icons.notifications_none_rounded, 'Bildirimler', '/bildirimler'),
                  if (me.isAgent) (Icons.person_search_outlined, 'Profilim (herkese görünen)', '/danisman/${me.id}'),
                ]),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Bell extends StatelessWidget {
  const _Bell({required this.count, required this.onTap});
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: count > 0 ? 'Bildirimler, $count okunmamış' : 'Bildirimler',
      onPressed: onTap,
      icon: Badge(
        isLabelVisible: count > 0,
        backgroundColor: EmColors.brand,
        label: Text(count > 9 ? '9+' : '$count'),
        child: const Icon(Icons.notifications_none_rounded),
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
          'Portföyüne ilan ekleyip meslektaşlarınla paylaşabilirsin.',
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

class _OfficeCard extends StatelessWidget {
  const _OfficeCard({required this.me});
  final Me me;

  @override
  Widget build(BuildContext context) {
    final hasOffice = me.officeName != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Ofis', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                if (me.officeRole != null) RoleChip(me.officeRole!),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              hasOffice
                  ? '${me.officeName}${me.officeActive ? '' : ' · yönetici incelemesinde'}'
                  : 'Bağımsız Danışman olarak görünüyorsun.',
              style: TextStyle(
                color: hasOffice ? EmColors.ink : EmColors.inkSoft,
                fontWeight: hasOffice ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
            const SizedBox(height: 14),
            OutlinedButton(
              onPressed: () => context.push('/ofis'),
              child: Text(hasOffice ? 'Ofisime git' : 'Ofisini bul'),
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
          'Akış ve Keşfet\'te doğrulanmış danışmanların ilanlarını görebilir, beğendiğin ilan için "İlgileniyorum" diyebilirsin.',
          style: TextStyle(color: EmColors.inkSoft),
        ),
      ),
    );
  }
}

class _Menu extends StatelessWidget {
  const _Menu({required this.items});
  final List<(IconData, String, String)> items;

  @override
  Widget build(BuildContext context) => Card(
        child: Column(children: [
          for (final (i, (icon, label, path)) in items.indexed) ...[
            if (i > 0) const Divider(height: 1, indent: 56, color: EmColors.line),
            ListTile(
              leading: Icon(icon, color: EmColors.ink),
              title: Text(label),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push(path),
            ),
          ],
        ]),
      );
}
