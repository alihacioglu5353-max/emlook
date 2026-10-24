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

  test('MyOffice üyelik, talep ve davetleri okur', () {
    final o = MyOffice.fromJson({
      'membership': {
        'membershipId': 'm1',
        'role': 'owner',
        'office': {'id': 'o1', 'name': 'Yılmaz Emlak', 'city': 'İstanbul', 'district': 'Kadıköy', 'status': 'pending'},
      },
      'independent': true,
      'requests': [],
      'invitations': [
        {
          'membershipId': 'm2',
          'createdAt': '2026-10-24T10:00:00.000Z',
          'office': {'id': 'o2', 'name': 'Ak Emlak', 'city': 'İstanbul', 'district': 'Ataşehir', 'status': 'active'},
        },
      ],
    });
    expect(o.role, OfficeRole.owner);
    expect(o.office!.isActive, isFalse);
    expect(o.invitations.single.office.place, 'Ataşehir, İstanbul');
  });

  test('Me ofis bilgisini okur; ofis yoksa bağımsızdır', () {
    final base = {
      'id': 'u1',
      'phone': '+905321234567',
      'fullName': 'Ayşe Yılmaz',
      'email': null,
      'role': 'agent',
      'onboardingRequired': false,
      'agent': {'verificationStatus': 'approved'},
    };
    final withOffice = Me.fromJson({
      ...base,
      'office': {'id': 'o1', 'name': 'Yılmaz Emlak', 'role': 'manager', 'status': 'active'},
    });
    expect(withOffice.officeRole, OfficeRole.manager);
    expect(withOffice.officeActive, isTrue);
    expect(Me.fromJson({...base, 'office': null}).officeName, isNull);
  });
}
