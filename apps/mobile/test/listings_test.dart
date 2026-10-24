import 'package:emlook/core/listings.dart';
import 'package:emlook/core/messaging.dart';
import 'package:emlook/core/models.dart';
import 'package:emlook/core/payments.dart';
import 'package:emlook/widgets/search_picker.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('biçimlendirme', () {
    test('binlik ayırıcı ve fiyat', () {
      expect(groupThousands(12500000), '12.500.000');
      expect(groupThousands(950), '950');
      expect(formatPrice(35000, 'rent'), '35.000 ₺ / ay');
      expect(formatPrice(8750000, 'sale'), '8.750.000 ₺');
    });

    test('kuruş ↔ TL', () {
      expect(formatKurus(12345050), '123.450,50 ₺');
      expect(formatKurus(100), '1,00 ₺');
      expect(parseTl('1.234,50'), 123450);
      expect(parseTl('1234.5'), 123450);
      expect(parseTl('150.000'), 15000000);
      expect(parseTl('12,345'), isNull);
      expect(parseTl(''), isNull);
    });

    test('Türkçe sıralama ve sadeleştirme', () {
      final names = ['Şişli', 'Çankaya', 'Üsküdar', 'Ataşehir', 'İzmit', 'Ilgaz', 'Odunpazarı', 'Ödemiş'];
      names.sort(compareTr);
      expect(names, ['Ataşehir', 'Çankaya', 'Ilgaz', 'İzmit', 'Odunpazarı', 'Ödemiş', 'Şişli', 'Üsküdar']);
      expect(foldTr('Kadıköy Şişli'), 'kadikoy sisli');
    });
  });

  test('ListingCard özet ve konum', () {
    final l = ListingCard.fromJson({
      'id': 'l1',
      'dealType': 'sale',
      'category': 'apartment',
      'title': 'Moda 3+1',
      'price': 12500000,
      'grossM2': 140,
      'netM2': 120,
      'rooms': '3+1',
      'cobrokeShare': 50,
      'status': 'active',
      'isDemo': false,
      'eidsVerified': true,
      'location': {'city': 'İstanbul', 'district': 'Kadıköy', 'neighbourhood': 'Caferağa'},
      'owner': {'id': 'u1', 'fullName': 'Ayşe Yılmaz', 'isVerified': true, 'officeName': 'Yılmaz Emlak'},
      'coverPhoto': '/listings/l1/photos/p1',
      'photoCount': 4,
      'likeCount': 2,
      'likedByMe': false,
      'savedByMe': true,
    });
    expect(l.summary, 'Satılık · Daire · 3+1 · 120 m²');
    expect(l.location.format(), 'Caferağa, Kadıköy, İstanbul');
    expect(l.location.format(withNeighbourhood: false), 'Kadıköy, İstanbul');
  });

  test('bildirim yönlendirmeleri', () {
    AppNotification n(String type, [Map<String, dynamic> data = const {}]) => AppNotification(
          id: 'n',
          type: type,
          title: '',
          body: '',
          read: false,
          createdAt: DateTime(2026),
          data: data,
        );
    expect(n('office.invited').route, '/ofis');
    expect(n('interest.received').route, '/talepler');
    expect(n('listing.liked', {'listingId': 'l1'}).route, '/ilan/l1');
    expect(n('social.followed', {'userId': 'u1'}).route, '/danisman/u1');
    expect(n('payment.paid', {'requestId': 'r1'}).route, '/odemeler/r1');
    expect(n('message', {'conversationId': 'c1'}).route, '/mesajlar/c1');
    expect(n('account.reactivated').route, isNull);
  });

  test('konuşma önizlemesi', () {
    final c = ConversationSummary.fromJson({
      'id': 'c1',
      'other': {'id': 'u2', 'fullName': 'Mehmet', 'isAgent': true, 'isVerified': true, 'officeName': null},
      'lastMessage': {'body': 'Merhaba', 'kind': 'text', 'mine': true, 'createdAt': '2026-10-24T10:00:00Z'},
      'unread': 0,
      'lastMessageAt': '2026-10-24T10:00:00Z',
    });
    expect(c.preview, 'Sen: Merhaba');
  });

  test('ödeme talebi', () {
    final p = PaymentRequestView.fromJson({
      'id': 'r1',
      'role': 'seller',
      'status': 'open',
      'amount': 10000000,
      'currency': 'TRY',
      'description': 'Komisyon',
      'payer': {'name': 'Can'},
      'listing': null,
      'seller': {'id': 'u1', 'fullName': 'Ayşe'},
      'buyerAgent': {'id': 'u2', 'fullName': 'Mehmet'},
      'buyerShare': 50,
      'breakdown': {'platformFee': 500000, 'seller': 4750000, 'buyer': 4750000, 'platformFeeBps': 500},
      'myShare': 4750000,
      'payouts': [],
      'link': 'https://emlook.com.tr/odeme/abc',
      'expiresAt': '2026-10-31T10:00:00Z',
      'paidAt': null,
      'createdAt': '2026-10-24T10:00:00Z',
    });
    expect(p.buyerAgentName, 'Mehmet');
    expect(formatKurus(p.myShare), '47.500,00 ₺');
  });
}
