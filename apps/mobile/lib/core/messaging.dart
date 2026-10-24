// E7 · Mesajlaşma modelleri

class ConversationSummary {
  ConversationSummary({
    required this.id,
    required this.otherId,
    required this.otherName,
    required this.otherIsAgent,
    required this.otherVerified,
    required this.otherOffice,
    required this.lastBody,
    required this.lastKind,
    required this.lastMine,
    required this.lastAt,
    required this.unread,
  });

  final String id;
  final String otherId;
  final String? otherName;
  final bool otherIsAgent;
  final bool otherVerified;
  final String? otherOffice;
  final String? lastBody;
  final String? lastKind;
  final bool lastMine;
  final DateTime? lastAt;
  final int unread;

  String get preview {
    if (lastBody == null) return 'Henüz mesaj yok';
    final body = lastKind == 'listing' ? '🏠 İlan paylaşıldı' : lastBody!;
    return lastMine ? 'Sen: $body' : body;
  }

  factory ConversationSummary.fromJson(Map<String, dynamic> j) {
    final o = j['other'] as Map<String, dynamic>;
    final last = j['lastMessage'] as Map<String, dynamic>?;
    final at = (last?['createdAt'] ?? j['lastMessageAt']) as String?;
    return ConversationSummary(
      id: j['id'] as String,
      otherId: o['id'] as String,
      otherName: o['fullName'] as String?,
      otherIsAgent: o['isAgent'] as bool? ?? false,
      otherVerified: o['isVerified'] as bool? ?? false,
      otherOffice: o['officeName'] as String?,
      lastBody: last?['body'] as String?,
      lastKind: last?['kind'] as String?,
      lastMine: last?['mine'] as bool? ?? false,
      lastAt: at == null ? null : DateTime.parse(at),
      unread: (j['unread'] as num?)?.toInt() ?? 0,
    );
  }
}

class ChatListing {
  ChatListing({
    required this.id,
    required this.title,
    required this.price,
    required this.dealType,
    required this.status,
    required this.coverPhoto,
  });

  final String id;
  final String title;
  final num price;
  final String dealType;
  final String status;
  final String? coverPhoto;
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.kind,
    required this.body,
    required this.mine,
    required this.createdAt,
    required this.cursor,
    required this.listing,
  });

  final String id;

  /// text | listing | system
  final String kind;
  final String body;
  final bool mine;
  final DateTime createdAt;
  final String cursor;
  final ChatListing? listing;

  factory ChatMessage.fromJson(Map<String, dynamic> j) {
    final l = j['listing'] as Map<String, dynamic>?;
    return ChatMessage(
      id: j['id'] as String,
      kind: j['kind'] as String,
      body: j['body'] as String? ?? '',
      mine: j['mine'] as bool? ?? false,
      createdAt: DateTime.parse(j['createdAt'] as String),
      cursor: j['cursor'] as String,
      listing: l == null
          ? null
          : ChatListing(
              id: l['id'] as String,
              title: l['title'] as String,
              price: l['price'] as num,
              dealType: l['dealType'] as String,
              status: l['status'] as String,
              coverPhoto: l['coverPhoto'] as String?,
            ),
    );
  }
}
