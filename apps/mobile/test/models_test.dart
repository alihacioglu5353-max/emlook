import 'package:emlook/core/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Me, API yanıtından danışman rozetini okur', () {
    final me = Me.fromJson({
      'id': 'u1',
      'phone': '+905321234567',
      'fullName': 'Ayşe Yılmaz',
      'email': null,
      'role': 'agent',
      'onboardingRequired': false,
      'agent': {'verificationStatus': 'approved', 'isVerified': true},
    });
    expect(me.isAgent, isTrue);
    expect(me.isVerified, isTrue);
    expect(me.firstName, 'Ayşe');
  });

  test('Verification eksikleri ve düzenlenebilirliği okur', () {
    final v = Verification.fromJson({
      'status': 'rejected',
      'profile': {
        'licenseNumber': '3400123',
        'businessName': null,
        'city': 'İstanbul',
        'district': null,
        'bio': null,
      },
      'rejectionReason': 'Belge okunmuyor',
      'documents': [
        {'id': 'd1', 'type': 'authority_certificate', 'originalName': 'a.pdf', 'sizeBytes': 2048},
      ],
      'missing': ['businessName', 'district'],
    });
    expect(v.editable, isTrue);
    expect(v.documents.single.typeLabel, 'Yetki belgesi');
    expect(v.missing, ['businessName', 'district']);
  });
}
