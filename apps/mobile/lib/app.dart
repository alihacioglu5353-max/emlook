import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/theme.dart';
import 'features/auth/code_screen.dart';
import 'features/auth/phone_screen.dart';
import 'features/home/home_screen.dart';
import 'features/notifications/notifications_screen.dart';
import 'features/office/office_screen.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/session.dart';
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

/// Oturum durumuna göre yönlendirme:
/// bilinmiyor → açılış · çıkış yapılmış → giriş · kayıt eksik → onboarding
GoRouter buildRouter(Session session) => GoRouter(
      initialLocation: '/acilis',
      refreshListenable: session,
      redirect: (context, state) {
        final loc = state.matchedLocation;
        final onAuth = loc.startsWith('/giris');
        switch (session.state) {
          case SessionState.unknown:
            return loc == '/acilis' ? null : '/acilis';
          case SessionState.signedOut:
            return onAuth ? null : '/giris';
          case SessionState.signedIn:
            if (session.me?.onboardingRequired ?? false) {
              return loc == '/kayit' ? null : '/kayit';
            }
            if (onAuth || loc == '/kayit' || loc == '/acilis') return '/';
            final agentOnly = loc == '/basvuru' || loc == '/ofis';
            if (agentOnly && !(session.me?.isAgent ?? false)) return '/';
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
              builder: (_, state) =>
                  CodeScreen(session: session, resendIn: state.extra as int? ?? 60),
            ),
          ],
        ),
        GoRoute(path: '/kayit', builder: (_, _) => OnboardingScreen(session: session)),
        GoRoute(path: '/', builder: (_, _) => HomeScreen(session: session)),
        GoRoute(path: '/basvuru', builder: (_, _) => VerificationScreen(session: session)),
        GoRoute(path: '/ofis', builder: (_, _) => OfficeScreen(session: session)),
        GoRoute(path: '/bildirimler', builder: (_, _) => NotificationsScreen(session: session)),
      ],
    );

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: EmLogo(size: 32)));
}
