import 'package:emlook/core/models.dart';
import 'package:emlook/features/legal/legal_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('kalın satır içi biçim ayrıştırılır', () {
    final spans = legalInline('Veri **sorumlusu** Emlook');
    expect(spans.map((s) => s.text), ['Veri ', 'sorumlusu', ' Emlook']);
    expect(spans[1].style?.fontWeight, FontWeight.w600);
  });

  test('markdown blokları üretilir', () {
    const md = '## Başlık\n\nBir paragraf\ndevamı.\n\n- bir\n- iki\n\n1. ilk\n2. ikinci\n\n> HUKUK NOTU: not';
    final blocks = legalBlocks(md);
    // başlık + paragraf + 2 madde + 2 numaralı + not
    expect(blocks, hasLength(7));
  });

  test('ticari ileti izni en son rıza kaydından okunur', () {
    Map<String, dynamic> me(bool granted) => {
          'id': 'u1',
          'phone': '+905551112233',
          'role': 'consumer',
          'consents': [
            {'type': 'kvkk_clarification', 'version': '2026-11', 'granted': true, 'at': '2026-10-24'},
            {'type': 'marketing', 'version': '2026-11', 'granted': granted, 'at': '2026-10-24'},
          ],
        };
    expect(Me.fromJson(me(true)).marketingConsent, isTrue);
    expect(Me.fromJson(me(false)).marketingConsent, isFalse);
    expect(Me.fromJson({'id': 'u', 'phone': 'p'}).marketingConsent, isFalse);
  });
}
