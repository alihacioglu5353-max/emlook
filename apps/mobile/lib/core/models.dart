enum VerificationStatus {
  draft('Taslak'),
  pending('İncelemede'),
  approved('Onaylı'),
  rejected('Reddedildi');

  const VerificationStatus(this.label);
  final String label;

  static VerificationStatus parse(Object? v) =>
      VerificationStatus.values.firstWhere((s) => s.name == v, orElse: () => draft);
}

class Me {
  Me({
    required this.id,
    required this.phone,
    required this.fullName,
    required this.email,
    required this.role,
    required this.onboardingRequired,
    required this.verificationStatus,
    this.officeName,
    this.officeRole,
    this.officeActive = false,
    this.marketingConsent = false,
  });

  final String id;
  final String phone;
  final String? fullName;
  final String? email;

  /// agent | consumer | admin; kayıt tamamlanmadıysa null
  final String? role;
  final bool onboardingRequired;
  final VerificationStatus? verificationStatus;

  /// Aktif ofis üyeliği; yoksa Bağımsız Danışman
  final String? officeName;
  final OfficeRole? officeRole;
  final bool officeActive;

  /// Ticari elektronik ileti izni (en son rıza kaydı)
  final bool marketingConsent;

  bool get isAgent => role == 'agent';
  bool get isVerified => verificationStatus == VerificationStatus.approved;
  String get firstName => (fullName ?? '').split(' ').first;

  factory Me.fromJson(Map<String, dynamic> j) {
    final agent = j['agent'] as Map<String, dynamic>?;
    final office = j['office'] as Map<String, dynamic>?;
    final consents = (j['consents'] as List<dynamic>? ?? const []).cast<Map<String, dynamic>>();
    final marketing = consents.where((c) => c['type'] == 'marketing').firstOrNull;
    return Me(
      id: j['id'] as String,
      phone: j['phone'] as String,
      fullName: j['fullName'] as String?,
      email: j['email'] as String?,
      role: j['role'] as String?,
      onboardingRequired: j['onboardingRequired'] as bool? ?? false,
      verificationStatus:
          agent == null ? null : VerificationStatus.parse(agent['verificationStatus']),
      officeName: office?['name'] as String?,
      officeRole: office == null ? null : OfficeRole.parse(office['role']),
      officeActive: office?['status'] == 'active',
      marketingConsent: marketing?['granted'] as bool? ?? false,
    );
  }
}

class VerificationDoc {
  VerificationDoc({
    required this.id,
    required this.type,
    required this.originalName,
    required this.sizeBytes,
  });

  final String id;
  final String type;
  final String originalName;
  final int sizeBytes;

  static const typeLabels = {
    'authority_certificate': 'Yetki belgesi',
    'identity': 'Kimlik',
    'other': 'Diğer',
  };

  String get typeLabel => typeLabels[type] ?? type;

  factory VerificationDoc.fromJson(Map<String, dynamic> j) => VerificationDoc(
        id: j['id'] as String,
        type: j['type'] as String,
        originalName: j['originalName'] as String,
        sizeBytes: (j['sizeBytes'] as num).toInt(),
      );
}

class Verification {
  Verification({
    required this.status,
    required this.licenseNumber,
    required this.businessName,
    required this.city,
    required this.district,
    required this.bio,
    required this.rejectionReason,
    required this.documents,
    required this.missing,
  });

  final VerificationStatus status;
  final String? licenseNumber;
  final String? businessName;
  final String? city;
  final String? district;
  final String? bio;
  final String? rejectionReason;
  final List<VerificationDoc> documents;
  final List<String> missing;

  bool get editable =>
      status == VerificationStatus.draft || status == VerificationStatus.rejected;

  static const missingLabels = {
    'licenseNumber': 'Yetki belgesi numarası',
    'businessName': 'İşletme unvanı',
    'city': 'İl',
    'district': 'İlçe',
    'document:authority_certificate': 'Yetki belgesi dosyası',
  };

  factory Verification.fromJson(Map<String, dynamic> j) {
    final p = j['profile'] as Map<String, dynamic>;
    return Verification(
      status: VerificationStatus.parse(j['status']),
      licenseNumber: p['licenseNumber'] as String?,
      businessName: p['businessName'] as String?,
      city: p['city'] as String?,
      district: p['district'] as String?,
      bio: p['bio'] as String?,
      rejectionReason: j['rejectionReason'] as String?,
      documents: (j['documents'] as List)
          .map((d) => VerificationDoc.fromJson(d as Map<String, dynamic>))
          .toList(),
      missing: (j['missing'] as List).cast<String>(),
    );
  }
}

// ---- E2 · Ofis ----

enum OfficeRole {
  owner('Sahip'),
  manager('Yönetici'),
  agent('Danışman');

  const OfficeRole(this.label);
  final String label;

  static OfficeRole parse(Object? v) =>
      OfficeRole.values.firstWhere((r) => r.name == v, orElse: () => agent);
}

class OfficeRef {
  OfficeRef({
    required this.id,
    required this.name,
    required this.city,
    required this.district,
    required this.status,
  });

  final String id;
  final String name;
  final String city;
  final String district;

  /// pending | active | rejected | suspended
  final String status;

  bool get isActive => status == 'active';
  String get place => '$district, $city';

  factory OfficeRef.fromJson(Map<String, dynamic> j) => OfficeRef(
        id: j['id'] as String,
        name: j['name'] as String,
        city: j['city'] as String? ?? '',
        district: j['district'] as String? ?? '',
        status: j['status'] as String? ?? 'active',
      );
}

class OfficeLink {
  OfficeLink({required this.membershipId, required this.office, required this.createdAt});
  final String membershipId;
  final OfficeRef office;
  final DateTime createdAt;

  factory OfficeLink.fromJson(Map<String, dynamic> j) => OfficeLink(
        membershipId: j['membershipId'] as String,
        office: OfficeRef.fromJson(j['office'] as Map<String, dynamic>),
        createdAt: DateTime.parse(j['createdAt'] as String),
      );
}

class MyOffice {
  MyOffice({
    required this.membershipId,
    required this.role,
    required this.office,
    required this.requests,
    required this.invitations,
  });

  final String? membershipId;
  final OfficeRole? role;
  final OfficeRef? office;
  final List<OfficeLink> requests;
  final List<OfficeLink> invitations;

  bool get hasOffice => office != null;

  factory MyOffice.fromJson(Map<String, dynamic> j) {
    final m = j['membership'] as Map<String, dynamic>?;
    List<OfficeLink> links(String k) => (j[k] as List)
        .map((e) => OfficeLink.fromJson(e as Map<String, dynamic>))
        .toList();
    return MyOffice(
      membershipId: m?['membershipId'] as String?,
      role: m == null ? null : OfficeRole.parse(m['role']),
      office: m == null ? null : OfficeRef.fromJson(m['office'] as Map<String, dynamic>),
      requests: links('requests'),
      invitations: links('invitations'),
    );
  }
}

class OfficeSearchItem {
  OfficeSearchItem({required this.id, required this.name, required this.place, required this.memberCount});
  final String id;
  final String name;
  final String place;
  final int memberCount;

  factory OfficeSearchItem.fromJson(Map<String, dynamic> j) => OfficeSearchItem(
        id: j['id'] as String,
        name: j['name'] as String,
        place: '${j['district']}, ${j['city']}',
        memberCount: (j['memberCount'] as num).toInt(),
      );
}

class AppNotification {
  AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.read,
    required this.createdAt,
    this.data = const {},
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final bool read;
  final DateTime createdAt;
  final Map<String, dynamic> data;

  /// Bildirime dokununca açılacak sayfa (yoksa null)
  String? get route {
    String? s(String k) => data[k] as String?;
    // Ekip yönetimi web panelinde; mobilde tüm ofis bildirimleri ofis ekranına gider.
    if (type.startsWith('office.')) return '/ofis';
    if (type.startsWith('interest.')) return '/talepler';
    if (type.startsWith('listing.')) {
      return s('listingId') == null ? null : '/ilan/${s('listingId')}';
    }
    if (type == 'social.followed') return s('userId') == null ? null : '/danisman/${s('userId')}';
    if (type.startsWith('payment.')) return s('requestId') == null ? '/odemeler' : '/odemeler/${s('requestId')}';
    if (type == 'message') return s('conversationId') == null ? '/mesajlar' : '/mesajlar/${s('conversationId')}';
    return null;
  }

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        type: j['type'] as String,
        title: j['title'] as String,
        body: j['body'] as String,
        read: j['readAt'] != null,
        createdAt: DateTime.parse(j['createdAt'] as String),
        data: (j['data'] as Map<String, dynamic>?) ?? const {},
      );
}
