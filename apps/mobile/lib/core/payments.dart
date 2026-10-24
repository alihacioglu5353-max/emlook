// E8 · Ödeme modelleri (tutarlar kuruş)

const paymentStatusLabels = {
  'open': 'Ödeme bekliyor',
  'paid': 'Ödendi',
  'cancelled': 'İptal edildi',
  'expired': 'Süresi doldu',
  'refunded': 'İade edildi',
};

const payoutKindLabels = {
  'platform': 'Emlook hizmet bedeli',
  'seller_agent': 'İlan danışmanı',
  'buyer_agent': 'Alıcı danışmanı',
};

const payoutStatusLabels = {
  'pending': 'Aktarım bekliyor',
  'settled': 'Aktarıldı',
  'held': 'IBAN bekleniyor',
  'failed': 'Aktarılamadı',
};

class PaymentSummary {
  PaymentSummary({
    required this.settled,
    required this.pending,
    required this.held,
    required this.openRequests,
    required this.platformFeeBps,
  });

  final int settled;
  final int pending;
  final int held;
  final int openRequests;
  final int platformFeeBps;

  factory PaymentSummary.fromJson(Map<String, dynamic> j) => PaymentSummary(
        settled: (j['settled'] as num).toInt(),
        pending: (j['pending'] as num).toInt(),
        held: (j['held'] as num).toInt(),
        openRequests: (j['openRequests'] as num).toInt(),
        platformFeeBps: (j['platformFeeBps'] as num).toInt(),
      );
}

class PayoutAccount {
  PayoutAccount({required this.holderName, required this.iban, required this.taxIdLast4, required this.status});
  final String holderName;
  final String iban;
  final String taxIdLast4;

  /// pending | verified | rejected
  final String status;

  factory PayoutAccount.fromJson(Map<String, dynamic> j) => PayoutAccount(
        holderName: j['holderName'] as String,
        iban: j['iban'] as String,
        taxIdLast4: j['taxIdLast4'] as String? ?? '',
        status: j['status'] as String,
      );
}

class PayoutLine {
  PayoutLine(this.kind, this.amount, this.status);
  final String kind;
  final int amount;
  final String status;
}

class PaymentRequestView {
  PaymentRequestView({
    required this.id,
    required this.role,
    required this.status,
    required this.amount,
    required this.description,
    required this.payerName,
    required this.listingTitle,
    required this.sellerName,
    required this.buyerAgentName,
    required this.buyerShare,
    required this.platformFee,
    required this.sellerAmount,
    required this.buyerAmount,
    required this.myShare,
    required this.payouts,
    required this.link,
    required this.expiresAt,
    required this.paidAt,
    required this.createdAt,
  });

  final String id;

  /// seller | buyer
  final String role;
  final String status;
  final int amount;
  final String description;
  final String payerName;
  final String? listingTitle;
  final String? sellerName;
  final String? buyerAgentName;
  final int buyerShare;
  final int platformFee;
  final int sellerAmount;
  final int buyerAmount;
  final int myShare;
  final List<PayoutLine> payouts;
  final String? link;
  final DateTime expiresAt;
  final DateTime? paidAt;
  final DateTime createdAt;

  factory PaymentRequestView.fromJson(Map<String, dynamic> j) {
    final b = j['breakdown'] as Map<String, dynamic>;
    final listing = j['listing'] as Map<String, dynamic>?;
    final buyer = j['buyerAgent'] as Map<String, dynamic>?;
    return PaymentRequestView(
      id: j['id'] as String,
      role: j['role'] as String,
      status: j['status'] as String,
      amount: (j['amount'] as num).toInt(),
      description: j['description'] as String,
      payerName: (j['payer'] as Map<String, dynamic>)['name'] as String,
      listingTitle: listing?['title'] as String?,
      sellerName: (j['seller'] as Map<String, dynamic>?)?['fullName'] as String?,
      buyerAgentName: buyer?['fullName'] as String?,
      buyerShare: (j['buyerShare'] as num?)?.toInt() ?? 0,
      platformFee: (b['platformFee'] as num).toInt(),
      sellerAmount: (b['seller'] as num).toInt(),
      buyerAmount: (b['buyer'] as num).toInt(),
      myShare: (j['myShare'] as num?)?.toInt() ?? 0,
      payouts: (j['payouts'] as List? ?? const [])
          .map((p) => PayoutLine(p['kind'] as String, (p['amount'] as num).toInt(), p['payoutStatus'] as String))
          .toList(),
      link: j['link'] as String?,
      expiresAt: DateTime.parse(j['expiresAt'] as String),
      paidAt: j['paidAt'] == null ? null : DateTime.parse(j['paidAt'] as String),
      createdAt: DateTime.parse(j['createdAt'] as String),
    );
  }
}
