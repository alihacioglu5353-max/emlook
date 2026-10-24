// E3–E6 · Portföy, akış, keşfet ve arama modelleri ile etiketler.

const dealLabels = {'sale': 'Satılık', 'rent': 'Kiralık'};

const categoryLabels = {
  'apartment': 'Daire',
  'residence': 'Rezidans',
  'villa': 'Villa',
  'detached_house': 'Müstakil ev',
  'land': 'Arsa',
  'shop': 'Dükkan',
  'office': 'Ofis / büro',
  'warehouse': 'Depo',
  'building': 'Bina',
  'other': 'Diğer',
};

const listingStatusLabels = {
  'draft': 'Taslak',
  'active': 'Yayında',
  'passive': 'Pasif',
  'sold': 'Satıldı / kiralandı',
  'removed': 'Kaldırıldı',
};

const visibilityLabels = {
  'public': ('Herkes', 'Danışmanlar ve mülk sahipleri görür'),
  'agents': ('Yalnızca danışmanlar', 'Mülk sahipleri göremez'),
  'network': ('Ağım', 'Seni takip eden danışmanlar ve ofis arkadaşların'),
};

const eidsLabels = {
  'unverified': 'Doğrulanmadı',
  'pending': 'İnceleniyor',
  'verified': 'EİDS onaylı',
  'failed': 'Doğrulanamadı',
};

/// 12500000 → "12.500.000"
String groupThousands(num n) {
  final s = n.round().abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write('.');
    b.write(s[i]);
  }
  return n < 0 ? '-$b' : b.toString();
}

String formatPrice(num price, [String? dealType]) =>
    '${groupThousands(price)} ₺${dealType == 'rent' ? ' / ay' : ''}';

/// Kuruş → "1.234,50 ₺"
String formatKurus(int kurus) {
  final tl = kurus ~/ 100;
  final rest = (kurus.abs() % 100).toString().padLeft(2, '0');
  return '${groupThousands(tl)},$rest ₺';
}

/// "1.234,50" / "1234.5" / "1.234" → kuruş; geçersizse null
int? parseTl(String input) {
  var s = input.trim().replaceAll(RegExp(r'\s|₺'), '');
  if (s.isEmpty) return null;
  if (s.contains(',')) {
    s = s.replaceAll('.', '').replaceFirst(',', '.');
  } else {
    s = s.replaceAll(RegExp(r'\.(?=\d{3}(\D|$))'), '');
  }
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(s)) return null;
  return (double.parse(s) * 100).round();
}

class ListingLocation {
  ListingLocation({required this.city, required this.district, this.neighbourhood});
  final String city;
  final String district;
  final String? neighbourhood;

  String format({bool withNeighbourhood = true}) =>
      [if (withNeighbourhood) neighbourhood, district, city].whereType<String>().join(', ');

  factory ListingLocation.fromJson(Map<String, dynamic> j) => ListingLocation(
        city: j['city'] as String? ?? '',
        district: j['district'] as String? ?? '',
        neighbourhood: j['neighbourhood'] as String?,
      );
}

class ListingCard {
  ListingCard({
    required this.id,
    required this.dealType,
    required this.category,
    required this.title,
    required this.price,
    required this.grossM2,
    required this.netM2,
    required this.rooms,
    required this.cobrokeShare,
    required this.status,
    required this.isDemo,
    required this.eidsVerified,
    required this.location,
    required this.ownerId,
    required this.ownerName,
    required this.ownerVerified,
    required this.ownerOffice,
    required this.coverPhoto,
    required this.photoCount,
    required this.likeCount,
    required this.likedByMe,
    required this.savedByMe,
  });

  final String id;
  final String dealType;
  final String category;
  final String title;
  final num price;
  final int? grossM2;
  final int? netM2;
  final String? rooms;
  final int? cobrokeShare;
  final String status;
  final bool isDemo;
  final bool eidsVerified;
  final ListingLocation location;
  final String ownerId;
  final String? ownerName;
  final bool ownerVerified;
  final String? ownerOffice;
  final String? coverPhoto;
  final int photoCount;
  int likeCount;
  bool likedByMe;
  bool savedByMe;

  String get summary => [
        dealLabels[dealType],
        categoryLabels[category],
        if (rooms != null) rooms,
        if ((netM2 ?? grossM2) != null) '${netM2 ?? grossM2} m²',
      ].whereType<String>().join(' · ');

  factory ListingCard.fromJson(Map<String, dynamic> j) {
    final owner = j['owner'] as Map<String, dynamic>? ?? const {};
    return ListingCard(
      id: j['id'] as String,
      dealType: j['dealType'] as String,
      category: j['category'] as String,
      title: j['title'] as String,
      price: j['price'] as num,
      grossM2: (j['grossM2'] as num?)?.toInt(),
      netM2: (j['netM2'] as num?)?.toInt(),
      rooms: j['rooms'] as String?,
      cobrokeShare: (j['cobrokeShare'] as num?)?.toInt(),
      status: j['status'] as String? ?? 'active',
      isDemo: j['isDemo'] as bool? ?? false,
      eidsVerified: j['eidsVerified'] as bool? ?? false,
      location: ListingLocation.fromJson(j['location'] as Map<String, dynamic>),
      ownerId: owner['id'] as String? ?? '',
      ownerName: owner['fullName'] as String?,
      ownerVerified: owner['isVerified'] as bool? ?? false,
      ownerOffice: owner['officeName'] as String?,
      coverPhoto: j['coverPhoto'] as String?,
      photoCount: (j['photoCount'] as num?)?.toInt() ?? 0,
      likeCount: (j['likeCount'] as num?)?.toInt() ?? 0,
      likedByMe: j['likedByMe'] as bool? ?? false,
      savedByMe: j['savedByMe'] as bool? ?? false,
    );
  }
}

class ListingPhoto {
  ListingPhoto({required this.id, required this.url});
  final String id;
  final String url;
}

class ListingDetail {
  ListingDetail({
    required this.id,
    required this.dealType,
    required this.category,
    required this.title,
    required this.description,
    required this.price,
    required this.grossM2,
    required this.netM2,
    required this.rooms,
    required this.floor,
    required this.buildingAge,
    required this.cityCode,
    required this.districtId,
    required this.neighbourhoodId,
    required this.location,
    required this.cobrokeShare,
    required this.visibility,
    required this.status,
    required this.isDemo,
    required this.eidsVerified,
    required this.eidsStatus,
    required this.propertyNumber,
    required this.eidsMessage,
    required this.photos,
    required this.ownerId,
    required this.ownerName,
    required this.ownerVerified,
    required this.ownerOfficeName,
    required this.likeCount,
    required this.likedByMe,
    required this.savedByMe,
    required this.isOwner,
    required this.removedReason,
  });

  final String id;
  final String dealType;
  final String category;
  final String title;
  final String? description;
  final num price;
  final int? grossM2;
  final int? netM2;
  final String? rooms;
  final String? floor;
  final int? buildingAge;
  final String cityCode;
  final int districtId;
  final int? neighbourhoodId;
  final ListingLocation location;
  final int? cobrokeShare;
  final String visibility;
  final String status;
  final bool isDemo;
  final bool eidsVerified;
  final String? eidsStatus;
  final String? propertyNumber;
  final String? eidsMessage;
  final List<ListingPhoto> photos;
  final String ownerId;
  final String? ownerName;
  final bool ownerVerified;
  final String? ownerOfficeName;
  int likeCount;
  bool likedByMe;
  bool savedByMe;
  final bool isOwner;
  final String? removedReason;

  bool get editable => isOwner && status != 'removed' && status != 'sold';

  factory ListingDetail.fromJson(Map<String, dynamic> j) {
    final owner = j['owner'] as Map<String, dynamic>;
    final eids = j['eids'] as Map<String, dynamic>? ?? const {};
    final office = owner['office'] as Map<String, dynamic>?;
    return ListingDetail(
      id: j['id'] as String,
      dealType: j['dealType'] as String,
      category: j['category'] as String,
      title: j['title'] as String,
      description: j['description'] as String?,
      price: j['price'] as num,
      grossM2: (j['grossM2'] as num?)?.toInt(),
      netM2: (j['netM2'] as num?)?.toInt(),
      rooms: j['rooms'] as String?,
      floor: j['floor'] as String?,
      buildingAge: (j['buildingAge'] as num?)?.toInt(),
      cityCode: j['cityCode'] as String,
      districtId: (j['districtId'] as num).toInt(),
      neighbourhoodId: (j['neighbourhoodId'] as num?)?.toInt(),
      location: ListingLocation.fromJson(j['location'] as Map<String, dynamic>),
      cobrokeShare: (j['cobrokeShare'] as num?)?.toInt(),
      visibility: j['visibility'] as String? ?? 'public',
      status: j['status'] as String,
      isDemo: j['isDemo'] as bool? ?? false,
      eidsVerified: eids['verified'] as bool? ?? false,
      eidsStatus: eids['status'] as String?,
      propertyNumber: eids['propertyNumber'] as String?,
      eidsMessage: eids['message'] as String?,
      photos: (j['photos'] as List? ?? const [])
          .map((p) => ListingPhoto(id: p['id'] as String, url: p['url'] as String))
          .toList(),
      ownerId: owner['id'] as String,
      ownerName: owner['fullName'] as String?,
      ownerVerified: owner['isVerified'] as bool? ?? false,
      ownerOfficeName: office?['name'] as String?,
      likeCount: (j['likeCount'] as num?)?.toInt() ?? 0,
      likedByMe: j['likedByMe'] as bool? ?? false,
      savedByMe: j['savedByMe'] as bool? ?? false,
      isOwner: j['isOwner'] as bool? ?? false,
      removedReason: j['removedReason'] as String?,
    );
  }
}

class CursorPage<T> {
  CursorPage(this.items, this.nextCursor);
  final List<T> items;
  final String? nextCursor;

  static CursorPage<ListingCard> listings(Map<String, dynamic> j) => CursorPage(
        (j['items'] as List).map((e) => ListingCard.fromJson(e as Map<String, dynamic>)).toList(),
        j['nextCursor'] as String?,
      );
}

class NamedOption {
  NamedOption(this.id, this.name);
  final String id;
  final String name;
}

class PersonCard {
  PersonCard({
    required this.id,
    required this.fullName,
    required this.isVerified,
    required this.subtitle,
    required this.followerCount,
    required this.followedByMe,
    required this.isAgent,
  });

  final String id;
  final String? fullName;
  final bool isVerified;
  final String subtitle;
  final int followerCount;
  bool followedByMe;
  final bool isAgent;

  factory PersonCard.fromJson(Map<String, dynamic> j) => PersonCard(
        id: j['id'] as String,
        fullName: j['fullName'] as String?,
        isVerified: j['isVerified'] as bool? ?? false,
        isAgent: j['isAgent'] as bool? ?? true,
        subtitle: [
          j['officeName'] ?? j['businessName'],
          [j['district'], j['city']].whereType<String>().join(', '),
        ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
        followerCount: (j['followerCount'] as num?)?.toInt() ?? 0,
        followedByMe: j['followedByMe'] as bool? ?? false,
      );
}

class AgentProfile {
  AgentProfile({
    required this.id,
    required this.fullName,
    required this.businessName,
    required this.place,
    required this.bio,
    required this.isVerified,
    required this.officeName,
    required this.officeRole,
    required this.followerCount,
    required this.followingCount,
    required this.activeListingCount,
    required this.followedByMe,
  });

  final String id;
  final String? fullName;
  final String? businessName;
  final String place;
  final String? bio;
  final bool isVerified;
  final String? officeName;
  final String? officeRole;
  int followerCount;
  final int followingCount;
  final int activeListingCount;
  bool followedByMe;

  factory AgentProfile.fromJson(Map<String, dynamic> j) {
    final office = j['office'] as Map<String, dynamic>?;
    return AgentProfile(
      id: j['id'] as String,
      fullName: j['fullName'] as String?,
      businessName: j['businessName'] as String?,
      place: [j['district'], j['city']].whereType<String>().join(', '),
      bio: j['bio'] as String?,
      isVerified: j['isVerified'] as bool? ?? false,
      officeName: office?['name'] as String?,
      officeRole: office?['role'] as String?,
      followerCount: (j['followerCount'] as num?)?.toInt() ?? 0,
      followingCount: (j['followingCount'] as num?)?.toInt() ?? 0,
      activeListingCount: (j['activeListingCount'] as num?)?.toInt() ?? 0,
      followedByMe: j['followedByMe'] as bool? ?? false,
    );
  }
}

class InterestItem {
  InterestItem({
    required this.id,
    required this.status,
    required this.note,
    required this.createdAt,
    required this.listingId,
    required this.listingTitle,
    required this.listingDealType,
    required this.listingPrice,
    required this.listingPlace,
    required this.listingCover,
    required this.requesterId,
    required this.requesterName,
    required this.requesterIsAgent,
    required this.requesterVerified,
    required this.ownerId,
    required this.ownerName,
    required this.conversationId,
  });

  final String id;
  final String status;
  final String? note;
  final DateTime createdAt;
  final String listingId;
  final String listingTitle;
  final String listingDealType;
  final num listingPrice;
  final String listingPlace;
  final String? listingCover;
  final String requesterId;
  final String? requesterName;
  final bool requesterIsAgent;
  final bool requesterVerified;
  final String ownerId;
  final String? ownerName;
  final String? conversationId;

  static const statusLabels = {
    'pending': 'Bekliyor',
    'accepted': 'Eşleşti',
    'declined': 'Reddedildi',
    'withdrawn': 'Geri çekildi',
  };

  factory InterestItem.fromJson(Map<String, dynamic> j) {
    final l = j['listing'] as Map<String, dynamic>;
    final loc = l['location'] as Map<String, dynamic>;
    final r = j['requester'] as Map<String, dynamic>;
    final o = j['owner'] as Map<String, dynamic>;
    return InterestItem(
      id: j['id'] as String,
      status: j['status'] as String,
      note: j['note'] as String?,
      createdAt: DateTime.parse(j['createdAt'] as String),
      listingId: l['id'] as String,
      listingTitle: l['title'] as String,
      listingDealType: l['dealType'] as String,
      listingPrice: l['price'] as num,
      listingPlace: '${loc['district']}, ${loc['city']}',
      listingCover: l['coverPhoto'] as String?,
      requesterId: r['id'] as String,
      requesterName: r['fullName'] as String?,
      requesterIsAgent: r['isAgent'] as bool? ?? false,
      requesterVerified: r['isVerified'] as bool? ?? false,
      ownerId: o['id'] as String,
      ownerName: o['fullName'] as String?,
      conversationId: j['conversationId'] as String?,
    );
  }
}
