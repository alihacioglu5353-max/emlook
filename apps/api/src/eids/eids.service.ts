import { Injectable } from '@nestjs/common';

export interface EidsCheckInput {
  /** Taşınmaz numarası */
  propertyNumber: string;
  /** İlanı veren emlak işletmesinin yetki belgesi numarası */
  licenseNumber: string;
}

export interface EidsCheckResult {
  status: 'verified' | 'failed' | 'pending';
  reference?: string;
  message: string;
}

/**
 * Ticaret Bakanlığı Elektronik İlan Doğrulama Sistemi (EİDS) yetki kontrolü.
 *
 * Emlook'un EİDS Taşınmaz API'ye entegre platform olarak onaylanması
 * bekleniyor. O zamana kadar:
 *  - `mock`   : geliştirme ve test (numarası 0000 ile biten taşınmazlar reddedilir)
 *  - `manual` : ilan beklemeye alınır; yönetici e-Devlet kaydını elle kontrol edip onaylar
 * Gerçek entegrasyon bu sınıfı genişleten bir `ApiEidsProvider` olarak eklenecek.
 */
export abstract class EidsProvider {
  abstract readonly name: string;
  abstract check(input: EidsCheckInput): Promise<EidsCheckResult>;
}

@Injectable()
export class MockEidsProvider extends EidsProvider {
  readonly name = 'mock';
  async check({ propertyNumber, licenseNumber }: EidsCheckInput): Promise<EidsCheckResult> {
    if (propertyNumber.endsWith('0000')) {
      return {
        status: 'failed',
        message: 'Bu taşınmaz için işletmenize ilan yetkisi verilmemiş (test sağlayıcısı)',
      };
    }
    return {
      status: 'verified',
      reference: `MOCK-${propertyNumber}-${licenseNumber}`,
      message: 'Yetki doğrulandı (test sağlayıcısı)',
    };
  }
}

@Injectable()
export class ManualEidsProvider extends EidsProvider {
  readonly name = 'manual';
  async check(): Promise<EidsCheckResult> {
    return {
      status: 'pending',
      message: 'Yetki kaydı Emlook ekibi tarafından kontrol edilecek',
    };
  }
}
