import 'package:flutter/material.dart';

import '../../widgets/listing_tile.dart';
import '../session.dart';

class SavedScreen extends StatelessWidget {
  const SavedScreen({super.key, required this.session});
  final Session session;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Kaydedilenler')),
        body: CursorListingList(
          api: session.api,
          path: '/me/saved',
          query: const {'limit': 12},
          empty: 'Henüz ilan kaydetmedin.',
        ),
      );
}
