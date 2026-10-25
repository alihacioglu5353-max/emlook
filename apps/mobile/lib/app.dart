import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/theme.dart';
import 'features/account/avatar_screen.dart';
import 'features/account/security_screen.dart';
import 'features/agents/agent_profile_screen.dart';
import 'features/auth/code_screen.dart';
import 'features/auth/forgot_screen.dart';
import 'features/auth/phone_screen.dart';
import 'features/discover/discover_screen.dart';
import 'features/discover/interests_screen.dart';
import 'features/feed/feed_screen.dart';
import 'features/feed/saved_screen.dart';
import 'features/home/home_screen.dart';
import 'features/legal/legal_screen.dart';
import 'features/listings/listing_detail_screen.dart';
import 'features/listings/listing_form_screen.dart';
import 'features/listings/my_listings_screen.dart';
import 'features/messages/chat_screen.dart';
import 'features/messages/conversations_screen.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/office/office_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/payments/payment_detail_screen.dart';
import 'features/payments/payment_new_screen.dart';
import 'features/payments/payments_screen.dart';
import 'features/search/search_screen.dart';
import 'features/session.dart';
import 'features/shell.dart';
import 'features/verification/verification_screen.dart';
import 'widgets/common.dart';

class EmlookApp extends StatefulWidget {
  const EmlookApp({super.key, required this.session});
  final Session session;

  @override
  State<EmlookApp> createState() => _EmlookAppState();
}

class _EmlookAppState extends State<EmlookApp> {
  late final GoRouter _router = buildRouter(widget.session);

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Emlook',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: _router,
    );
  }
}

/// Yalnızca danışmanların açabileceği sayfalar
bool _agentOnly(String loc) =>
    loc == '/basvuru' || loc == '/ofis' || loc.startsWith('/portfoy') || loc.startsWith('/odemeler');

/// Oturum durumuna göre yönlendirme:
/// bilinmiyor → açılış · çıkış yapılmış → giriş · kayıt eksik → onboarding
GoRouter buildRouter(Session session) => GoRouter(
      initialLocation: '/acilis',
      refreshListenable: session,
      redirect: (context, state) {
        final loc = state.matchedLocation;
        final onAuth = loc.startsWith('/giris');
        // Hukuki metinler oturumdan bağımsız açılır (giriş ve kayıt ekranından).
        if (loc.startsWith('/yasal/') && session.state != SessionState.unknown) return null;
        switch (session.state) {
          case SessionState.unknown:
            return loc == '/acilis' ? null : '/acilis';
          case SessionState.signedOut:
            return onAuth ? null : '/giris';
          case SessionState.signedIn:
            if (session.me?.onboardingRequired ?? false) {
              return loc == '/kayit' ? null : '/kayit';
            }
            if (onAuth || loc == '/kayit' || loc == '/acilis') return '/akis';
            if (_agentOnly(loc) && !(session.me?.isAgent ?? false)) return '/';
            return null;
        }
      },
      routes: [
        GoRoute(path: '/acilis', builder: (_, _) => const _Splash()),
        GoRoute(
          path: '/giris',
          builder: (_, _) => PhoneScreen(session: session),
          routes: [
            GoRoute(
              path: 'kod',
              builder: (_, state) => CodeScreen(session: session, resendIn: state.extra as int? ?? 60),
            ),
            GoRoute(
              path: 'parola-sifirla',
              builder: (_, state) => ForgotPasswordScreen(session: session, email: state.extra as String?),
            ),
          ],
        ),
        GoRoute(path: '/kayit', builder: (_, _) => OnboardingScreen(session: session)),
        GoRoute(
          path: '/yasal/:slug',
          builder: (_, s) => LegalScreen(session: session, slug: s.pathParameters['slug']!),
        ),

        // Alt menülü sekmeler
        StatefulShellRoute.indexedStack(
          builder: (_, _, shell) => AppShell(session: session, shell: shell),
          branches: [
            StatefulShellBranch(routes: [
              GoRoute(path: '/akis', builder: (_, _) => FeedScreen(session: session)),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/kesfet', builder: (_, _) => DiscoverScreen(session: session)),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/ara', builder: (_, _) => SearchScreen(session: session)),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/mesajlar', builder: (_, _) => ConversationsScreen(session: session)),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/', builder: (_, _) => HomeScreen(session: session)),
            ]),
          ],
        ),

        // Tam ekran sayfalar
        GoRoute(
          path: '/ilan/:id',
          builder: (_, s) => ListingDetailScreen(session: session, id: s.pathParameters['id']!),
        ),
        GoRoute(
          path: '/danisman/:id',
          builder: (_, s) => AgentProfileScreen(session: session, id: s.pathParameters['id']!),
        ),
        GoRoute(
          path: '/mesajlar/:id',
          builder: (_, s) => ChatScreen(session: session, id: s.pathParameters['id']!),
        ),
        GoRoute(path: '/kaydedilenler', builder: (_, _) => SavedScreen(session: session)),
        GoRoute(path: '/talepler', builder: (_, _) => InterestsScreen(session: session)),
        GoRoute(path: '/portfoy', builder: (_, _) => MyListingsScreen(session: session)),
        GoRoute(path: '/portfoy/yeni', builder: (_, _) => ListingFormScreen(session: session)),
        GoRoute(
          path: '/portfoy/:id/duzenle',
          builder: (_, s) => ListingFormScreen(session: session, id: s.pathParameters['id']),
        ),
        GoRoute(path: '/odemeler', builder: (_, _) => PaymentsScreen(session: session)),
        GoRoute(path: '/odemeler/yeni', builder: (_, _) => PaymentNewScreen(session: session)),
        GoRoute(
          path: '/odemeler/:id',
          builder: (_, s) => PaymentDetailScreen(session: session, id: s.pathParameters['id']!),
        ),
        GoRoute(path: '/basvuru', builder: (_, _) => VerificationScreen(session: session)),
        GoRoute(path: '/ofis', builder: (_, _) => OfficeScreen(session: session)),
        GoRoute(path: '/profil-resmi', builder: (_, _) => AvatarScreen(session: session)),
        GoRoute(path: '/guvenlik', builder: (_, _) => SecurityScreen(session: session)),
        GoRoute(path: '/bildirimler', builder: (_, _) => NotificationsScreen(session: session)),
      ],
    );

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: EmLogo(size: 32)));
}
