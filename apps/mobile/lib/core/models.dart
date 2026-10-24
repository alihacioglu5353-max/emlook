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
  });

  final String id;
  final String phone;
  final String? fullName;
  final String? email;

  /// agent | consumer | admin; kayıt tamamlanmadıysa null
  final String? role;
  final bool onboardingRequired;
  final VerificationStatus? verificationStatus;

  bool get isAgent => role == 'agent';
  bool get isVerified => verificationStatus == VerificationStatus.approved;
  String get firstName => (fullName ?? '').split(' ').first;

  factory Me.fromJson(Map<String, dynamic> j) {
    final agent = j['agent'] as Map<String, dynamic>?;
    return Me(
      id: j['id'] as String,
      phone: j['phone'] as String,
      fullName: j['fullName'] as String?,
      email: j['email'] as String?,
      role: j['role'] as String?,
      onboardingRequired: j['onboardingRequired'] as bool? ?? false,
      verificationStatus:
          agent == null ? null : VerificationStatus.parse(agent['verificationStatus']),
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
