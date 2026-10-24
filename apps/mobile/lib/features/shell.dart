import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';
import 'session.dart';

/// Alt menülü ana iskelet: Akış · Keşfet · Ara · Mesajlar · Profil.
/// Okunmamış sayıları 30 sn'de bir yenilenir.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.session, required this.shell});
  final Session session;
  final StatefulNavigationShell shell;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with WidgetsBindingObserver {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.session.refreshUnread();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => widget.session.refreshUnread());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) widget.session.refreshUnread();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: widget.shell,
      bottomNavigationBar: ListenableBuilder(
        listenable: widget.session,
        builder: (context, _) {
          final unread = widget.session.unreadMessages;
          return NavigationBar(
            selectedIndex: widget.shell.currentIndex,
            onDestinationSelected: (i) => widget.shell.goBranch(i, initialLocation: i == widget.shell.currentIndex),
            indicatorColor: EmColors.brandTint,
            destinations: [
              const NavigationDestination(icon: Icon(Icons.dynamic_feed_outlined), selectedIcon: Icon(Icons.dynamic_feed), label: 'Akış'),
              const NavigationDestination(icon: Icon(Icons.style_outlined), selectedIcon: Icon(Icons.style), label: 'Keşfet'),
              const NavigationDestination(icon: Icon(Icons.search), label: 'Ara'),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: unread > 0,
                  backgroundColor: EmColors.brand,
                  label: Text(unread > 99 ? '99+' : '$unread'),
                  child: const Icon(Icons.chat_bubble_outline),
                ),
                selectedIcon: const Icon(Icons.chat_bubble),
                label: 'Mesajlar',
              ),
              const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profil'),
            ],
          );
        },
      ),
    );
  }
}
