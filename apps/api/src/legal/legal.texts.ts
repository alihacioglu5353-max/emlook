/**
 * Hukuki metinler — TEK KAYNAK. Web (/kvkk, /kosullar, /ticari-ileti) ve mobil
 * uygulama bu metinleri `GET /legal/:slug` ile alır.
 *
 * DURUM: TASLAK. Yayından önce hukuk danışmanı incelemeli; köşeli parantezli
 * [ ... ] alanlar şirket bilgileriyle doldurulmalı, "HUKUK NOTU" satırları
 * kaldırılmalıdır.
 *
 * Metin değiştiğinde:
 *  1. `version` alanını artırın (örn. 2026-11 → 2027-01),
 *  2. API ortamında KVKK_CLARIFICATION_VERSION / TERMS_VERSION aynı değere getirin,
 *  3. Kullanım koşulları esaslı değiştiyse kullanıcılardan yeniden onay alın.
 *
 * Yazım kuralları (KVKK Kurulu 18.02.2026 tarihli, 2026/347 sayılı İlke Kararı):
 *  - Aydınlatma metni sözleşme değildir; "okudum ve anladım" ile teyit alınır,
 *    "kabul ediyorum / onaylıyorum / açık rıza veriyorum" ifadesi kullanılmaz.
 *  - Açık rıza gerekiyorsa aydınlatmadan AYRI metin ve ayrı beyanla alınır.
 *  - "Kanun'un 5. ve 6. maddeleri kapsamında" gibi genel ifadeler yerine amaç ve
 *    hukuki sebep eşleştirilerek yazılır.
 */

export type LegalSlug = 'kvkk' | 'kosullar' | 'ticari-ileti';

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  version: string;
  updatedAt: string;
  draft: boolean;
  /** Sade markdown: #, ##, ###, -, 1., **kalın** */
  body: string;
}

const KVKK = `
Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("Kanun") 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, Emlook mobil uygulaması ve emlook.com.tr web sitesini ("Platform") kullananları bilgilendirmek için hazırlanmıştır.

## 1. Veri sorumlusu

**[ŞİRKET UNVANI]** ("Emlook")
Adres: [ADRES]
MERSİS No: [MERSİS NO] · KEP: [KEP ADRESİ] · E-posta: kvkk@emlook.com.tr

## 2. Hangi kişisel verilerinizi işliyoruz?

- **Kimlik:** ad soyad. Ödeme hesabı ekleyen danışmanlarda T.C. kimlik numarası veya vergi kimlik numarası.
- **İletişim:** cep telefonu numarası, e-posta adresi (isteğe bağlı).
- **Mesleki bilgiler (danışmanlar):** taşınmaz ticareti yetki belgesi numarası, belgede yazan işletme unvanı, çalışılan il ve ilçe, yüklenen yetki belgesi ve kimlik görüntüleri, ofis üyeliği ve rolü, kısa tanıtım yazısı.
- **İlan ve portföy bilgileri:** taşınmazın konumu, nitelikleri, fiyatı, fotoğrafları, EİDS taşınmaz numarası ve doğrulama sonucu, komisyon paylaşım oranı.
- **Platform içi etkileşimler:** takip, beğeni, kaydetme, keşfet kararları, ilgi ve eşleşme talepleri, şikâyetler.
- **Yazışmalar:** Platform içi mesajlarınızın içeriği ve paylaşılan ilan kartları.
- **Finansal bilgiler (danışmanlar):** IBAN, hesap sahibi adı, ödeme talepleri, tahsilat ve aktarım kayıtları, fatura bilgileri. Kart bilgileriniz Emlook'a ulaşmaz; doğrudan lisanslı ödeme kuruluşu tarafından işlenir.
- **İşlem güvenliği:** IP adresi, cihaz ve tarayıcı bilgisi, oturum kayıtları, doğrulama kodu (OTP) gönderim kayıtları, işlem ve denetim kayıtları.
- **Cihaz bilgisi:** bildirim gönderebilmek için cihazınıza ait anonim bildirim belirteci.
- **İzin kayıtları:** aydınlatma metninin okunduğuna, kullanım koşullarının kabulüne ve ticari ileti iznine ilişkin kayıtlar (sürüm, tarih, IP).

Platformu reşit olmayanlara yönelik sunmuyoruz ve bilerek 18 yaşından küçüklerin verisini işlemiyoruz. Özel nitelikli kişisel veri (sağlık, din, biyometrik vb.) talep etmiyoruz; yüklediğiniz belgelerde bu tür bilgi bulunuyorsa lütfen kapatarak yükleyin.

## 3. Hangi amaçlarla ve hangi hukuki sebebe dayanarak işliyoruz?

**Sözleşmenin kurulması ve ifası (Kanun m. 5/2-c)**
- Hesabınızı açmak, telefonla giriş yapmanızı sağlamak, oturumunuzu yönetmek,
- danışman profilinizi, ofis üyeliğinizi ve ilanlarınızı yayınlamak; ilanların görünürlük ayarınıza göre diğer kullanıcılara gösterilmesi,
- akış, keşfet, arama, eşleşme ve mesajlaşma özelliklerini sunmak,
- komisyon ödeme bağlantısı oluşturmak, tahsilatı ve pay aktarımını sağlamak, bildirim göndermek.

**Hukuki yükümlülüğün yerine getirilmesi (Kanun m. 5/2-ç)**
- Taşınmaz Ticareti Hakkında Yönetmelik kapsamında ilan veren işletmenin yetkisini Elektronik İlan Doğrulama Sistemi (EİDS) üzerinden doğrulamak,
- vergi mevzuatı kapsamında fatura düzenlemek ve muhasebe kayıtlarını saklamak,
- 6563 sayılı Kanun kapsamında ticari ileti izinlerini İleti Yönetim Sistemi'ne (İYS) bildirmek,
- yetkili kamu kurum ve kuruluşlarının bilgi ve belge taleplerini karşılamak.

**Meşru menfaatimiz için zorunlu olması (Kanun m. 5/2-f)** — temel hak ve özgürlüklerinize zarar vermemek kaydıyla:
- yetkisiz erişimi, sahte hesapları, sahte ilanları ve dolandırıcılığı önlemek; şikâyetleri incelemek,
- danışman başvurularını ve ofis başvurularını doğrulamak,
- Platform güvenliğini, sürekliliğini ve kalitesini sağlamak; toplu ve anonim istatistikler üretmek.

**Bir hakkın tesisi, kullanılması veya korunması (Kanun m. 5/2-e)**
- Uyuşmazlık, şikâyet ve hukuki süreçlerde delil olarak kullanmak.

Yukarıdaki işlemler için açık rızanıza başvurmuyoruz. Ticari elektronik ileti izniniz, 6563 sayılı Kanun kapsamında ayrıca ve isteğe bağlı olarak alınır; izni vermemeniz Platformu kullanmanızı etkilemez.

## 4. Kişisel verilerinizi kimlere aktarıyoruz?

**Platformdaki diğer kullanıcılar:** Danışman profiliniz (ad soyad, unvan, ofis, il/ilçe, onay rozeti) ve yayındaki ilanlarınız seçtiğiniz görünürlük ayarına göre diğer kullanıcılara gösterilir. Telefon numaranız ve belgeleriniz diğer kullanıcılara gösterilmez. Mülk sahibi kullanıcılar komisyon paylaşım oranını görmez.

**Yurt içindeki alıcılar:**
- lisanslı ödeme kuruluşu ([ÖDEME KURULUŞU UNVANI]) — tahsilat, alt üye işyeri kaydı ve pay aktarımı,
- e-Fatura / e-Arşiv entegratörü — fatura düzenleme,
- SMS hizmet sağlayıcısı (Netgsm İletişim ve Bilgi Teknolojileri A.Ş.) — doğrulama kodu ve bilgilendirme mesajları,
- T.C. Ticaret Bakanlığı — EİDS yetki doğrulaması,
- yetkili kamu kurum ve kuruluşları ile yargı mercileri — talep edilmesi halinde,
- hukuk, mali müşavirlik ve denetim hizmeti aldığımız danışmanlar — sır saklama yükümlülüğü altında.

**Yurt dışındaki alıcılar:**
- Bildirim altyapısı: Google Firebase Cloud Messaging (Google LLC / Google Ireland Ltd.) — cihaz bildirim belirteci ve bildirim içeriği.
- [BULUT / NESNE DEPOLAMA SAĞLAYICISI VE ÜLKESİ] — fotoğraf ve belge dosyaları.

Yurt dışına aktarımlar Kanun'un 9. maddesine uygun olarak, Kişisel Verileri Koruma Kurulu'nun yayımladığı standart sözleşmeler imzalanarak ve Kurum'a bildirilerek yapılır.

> HUKUK NOTU: Yurt dışı aktarım yapılacak her sağlayıcıyla standart sözleşme imzalanıp imza tarihinden itibaren 5 iş günü içinde Kurum'a bildirilmeli; sunucu konumu Türkiye seçilirse ilgili satır kaldırılmalıdır.

## 5. Kişisel verilerinizi nasıl topluyoruz?

Verilerinizi Platform'daki formlar, belge ve fotoğraf yüklemeleri, mesajlaşma ve kullanım sırasında oluşan kayıtlar aracılığıyla elektronik ortamda; EİDS doğrulama sonucunu ise Ticaret Bakanlığı sisteminden otomatik yollarla topluyoruz.

## 6. Ne kadar süre saklıyoruz?

- Hesap ve profil bilgileri: hesabınız açık kaldığı sürece; kapatıldıktan sonra hukuki uyuşmazlıklar için genel zamanaşımı süresi kadar.
- Fatura ve muhasebe kayıtları: vergi ve ticaret mevzuatında öngörülen süre (10 yıl).
- İşlem güvenliği ve erişim kayıtları: [2] yıl.
- Doğrulama kodları: kullanıldıktan veya süresi dolduktan sonra en geç [30] gün.
- Mesajlar: hesap açık kaldığı sürece; hesap kapatılınca karşı tarafın erişimi bozulmayacak şekilde ad bilgisi kaldırılarak.

Süre dolduğunda verileriniz Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik'e uygun olarak silinir, yok edilir veya anonim hale getirilir.

> HUKUK NOTU: Saklama süreleri kişisel veri saklama ve imha politikasıyla birlikte netleştirilmelidir.

## 7. Haklarınız

Kanun'un 11. maddesi uyarınca kişisel verilerinizin;
1. işlenip işlenmediğini öğrenme,
2. işlenmişse buna ilişkin bilgi talep etme,
3. işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,
4. yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,
5. eksik veya yanlış işlenmişse düzeltilmesini isteme,
6. Kanun'un 7. maddesindeki şartlar çerçevesinde silinmesini veya yok edilmesini isteme,
7. düzeltme, silme ve yok etme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme,
8. münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme,
9. kanuna aykırı işlenmesi sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme

haklarına sahipsiniz.

## 8. Başvuru

Taleplerinizi Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak;
- [ADRES] adresine yazılı olarak,
- [KEP ADRESİ] adresine kayıtlı elektronik posta ile,
- Platform'a kayıtlı e-posta adresinizden kvkk@emlook.com.tr adresine

iletebilirsiniz. Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi halinde Kurul'ca belirlenen tarifedeki ücret alınabilir. Başvurunuzun reddedilmesi, verilen cevabın yetersiz bulunması veya süresinde cevap verilmemesi halinde Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz.
`;

const TERMS = `
Bu Kullanım Koşulları ("Koşullar"), **[ŞİRKET UNVANI]** ("Emlook") tarafından sunulan Emlook mobil uygulaması ve emlook.com.tr web sitesinin ("Platform") kullanımına ilişkin şartları düzenler. Hesap oluştururken Koşulları kabul etmiş olursunuz.

## 1. Tanımlar

- **Danışman:** Taşınmaz Ticareti Hakkında Yönetmelik kapsamında yetki belgesine sahip işletme adına faaliyet gösteren ve Platform'da danışman hesabı açan kişi.
- **Onaylı danışman:** Yetki belgesi bilgileri Emlook tarafından incelenip onaylanan danışman.
- **Ofis:** Onaylı bir danışmanın açtığı ve Emlook'un onayladığı emlak işletmesi hesabı.
- **Mülk sahibi:** İlanları görüntüleyen ve danışmanlara talep bırakan kullanıcı.
- **Paylaşım oranı:** İlan sahibi danışmanın, işlemi gerçekleştiren meslektaşına bırakmayı taahhüt ettiği komisyon yüzdesi.

## 2. Hesap ve üyelik

- Platform'u kullanmak için 18 yaşını doldurmuş olmanız ve doğru bilgi vermeniz gerekir.
- Hesabınıza cep telefonunuza gönderilen tek kullanımlık kodla giriş yaparsınız; kodu kimseyle paylaşmamaktan ve cihazınızın güvenliğinden siz sorumlusunuz.
- Hesap tipinizi (danışman / mülk sahibi) kayıt sırasında seçersiniz.
- Danışman hesabıyla ilan yayınlamak, ofise katılmak ve ödeme almak için yetki belgesi bilgilerinizin onaylanması gerekir. Emlook, eksik veya tutarsız başvuruları gerekçe göstererek reddedebilir.

## 3. Danışmanların yükümlülükleri

- Yalnızca yetkili olduğunuz taşınmazlar için ilan verirsiniz. Yayın için Elektronik İlan Doğrulama Sistemi (EİDS) yetki doğrulaması gerekir; "Deneme" olarak işaretlenen ilanlar yalnızca tanıtım amaçlıdır ve gerçek bir teklif oluşturmaz.
- İlan bilgileri (fiyat, konum, nitelikler, fotoğraflar) doğru ve güncel olmalıdır. Satılan veya kiralanan taşınmazı "satıldı / kiralandı" olarak işaretlemeniz gerekir.
- İlanda belirttiğiniz paylaşım oranı, ilanı satan veya kiralayan meslektaşınıza karşı taahhüdünüzdür. Emlook bu taahhüdün tarafı değildir; ancak Platform üzerinden alınan ödemelerde bölüşüm bu orana göre yapılır.
- Taşınmaz ticaretine ilişkin mevzuattan (yetki belgesi, yetkilendirme sözleşmesi, komisyon sınırları, vergi yükümlülükleri) kaynaklanan sorumluluk size aittir.

## 4. Yasak kullanımlar

Platform'da şunları yapamazsınız:
- yanıltıcı, sahte, mükerrer veya yetkiniz olmayan ilan yayınlamak,
- başkasının kimliğine bürünmek, başkasının yetki belgesini kullanmak,
- kullanıcıları Platform dışında ödeme yapmaya yönlendirerek dolandırıcılık amaçlı yazışmak,
- hakaret, taciz, ayrımcılık içeren veya hukuka aykırı içerik paylaşmak,
- diğer kullanıcıların kişisel verilerini izinsiz toplamak, toplu mesaj veya istenmeyen ileti göndermek,
- Platform'un güvenliğini tehdit etmek, otomatik araçlarla veri çekmek, sistemleri aşırı yüklemek.

Emlook bu durumlarda içeriği kaldırabilir, hesabı askıya alabilir veya kapatabilir; bildirimde gerekçe belirtilir. Hukuka aykırı içerikler yetkili makamlara bildirilebilir.

## 5. Ödemeler

- Danışmanlar Platform üzerinden komisyon ödeme bağlantısı oluşturabilir. Tahsilat, 6493 sayılı Kanun kapsamında lisanslı ödeme kuruluşu ([ÖDEME KURULUŞU UNVANI]) aracılığıyla yapılır; kart bilgileri Emlook'a ulaşmaz.
- Tahsil edilen tutardan Emlook hizmet bedeli düşülür; kalan tutar ilan danışmanı ile (varsa) alıcı tarafındaki danışman arasında ödeme talebinde belirtilen orana göre bölüştürülür ve kayıtlı IBAN'lara aktarılır. IBAN'ı onaylanmamış danışmanın payı, hesap onaylanana kadar bekletilir.
- Hizmet bedeli oranı ödeme talebi oluşturulurken gösterilir. Emlook hizmet bedeli için fatura düzenler; komisyon hizmetinin faturalandırılması ilgili danışmanın / işletmenin sorumluluğundadır.

> HUKUK NOTU: Ödeme kuruluşu sözleşmesi, fatura modeli ve iade/itiraz süreçleri netleşince bu bölüm güncellenmelidir.

## 6. İçerik ve fikri mülkiyet

- Yüklediğiniz ilan metni ve fotoğrafların hak sahibi olduğunuzu veya kullanma yetkiniz bulunduğunu beyan edersiniz. Bu içerikleri Platform'da göstermek, uyarlamak (ör. boyutlandırma) ve Platform'u tanıtmak amacıyla kullanmak için Emlook'a, hesabınız açık kaldığı sürece geçerli, münhasır olmayan ve bedelsiz bir kullanım izni verirsiniz.
- Platform'un yazılımı, tasarımı, markası ve içerik düzeni Emlook'a aittir; izinsiz kopyalanamaz.

## 7. Sorumluluğun sınırları

- Emlook, danışmanlar ile müşteriler ve danışmanlar arasındaki işlemlerin tarafı değildir; ilanların doğruluğunu, taşınmazın hukuki ve fiziki durumunu garanti etmez. EİDS onayı yalnızca ilan verenin yetkisinin doğrulandığını gösterir.
- Platform "olduğu gibi" sunulur. Bakım, güncelleme veya Emlook'un kontrolü dışındaki nedenlerle kesintiler yaşanabilir.
- Emlook'un sorumluluğu, kast ve ağır ihmal halleri saklı kalmak üzere, doğrudan zararla ve ilgili işlemde aldığı hizmet bedeliyle sınırlıdır.

## 8. Hesabın kapatılması

Hesabınızı dilediğiniz zaman kapatabilirsiniz. Kapatma, Platform üzerinden başlatılmış ve tamamlanmamış ödemelerin sonuçlanmasını etkilemez. Kişisel verilerinizin saklanması KVKK Aydınlatma Metni'ndeki sürelere tabidir.

## 9. Değişiklikler

Emlook bu Koşulları güncelleyebilir. Esaslı değişiklikler yürürlüğe girmeden önce Platform'da ve/veya bildirimle duyurulur; değişiklikleri kabul etmezseniz hesabınızı kapatabilirsiniz. Güncel sürüm ve tarih bu sayfada yer alır.

## 10. Uygulanacak hukuk ve uyuşmazlıklar

Bu Koşullar Türk hukukuna tabidir. Tüketici sıfatıyla işlem yapan kullanıcılar için 6502 sayılı Tüketicinin Korunması Hakkında Kanun kapsamındaki tüketici hakem heyetleri ve tüketici mahkemelerine başvuru hakkı saklıdır. Diğer uyuşmazlıklarda [İSTANBUL (ÇAĞLAYAN)] mahkemeleri ve icra daireleri yetkilidir.

## 11. İletişim

[ŞİRKET UNVANI] · [ADRES] · destek@emlook.com.tr
`;

const MARKETING = `
Bu izin isteğe bağlıdır; vermemeniz Platform'u kullanmanızı etkilemez.

İzin vermeniz halinde **[ŞİRKET UNVANI]** ("Emlook"), 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik kapsamında; yeni özellikler, kampanyalar, etkinlikler ve sektörel duyurular hakkında size **SMS, e-posta ve uygulama bildirimi** yoluyla ticari elektronik ileti gönderebilir. İzniniz İleti Yönetim Sistemi'ne (İYS) kaydedilir.

İzninizi dilediğiniz zaman ücretsiz olarak geri alabilirsiniz:
- mobil uygulamada veya web panelinde Profil bölümünden,
- iletilerdeki ret bağlantısını kullanarak,
- İYS üzerinden (iys.org.tr),
- destek@emlook.com.tr adresine yazarak.

Hesap güvenliği (doğrulama kodu) ve hizmetle ilgili zorunlu bildirimler (ödeme, eşleşme, ilan durumu vb.) ticari ileti sayılmaz ve bu izinden bağımsız olarak gönderilir.

Kişisel verilerinizin işlenmesine ilişkin ayrıntılar için KVKK Aydınlatma Metni'ni inceleyebilirsiniz.
`;

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = {
  kvkk: {
    slug: 'kvkk',
    title: 'KVKK Aydınlatma Metni',
    version: '2026-11',
    updatedAt: '2026-10-24',
    draft: true,
    body: KVKK.trim(),
  },
  kosullar: {
    slug: 'kosullar',
    title: 'Kullanım Koşulları',
    version: '2026-11',
    updatedAt: '2026-10-24',
    draft: true,
    body: TERMS.trim(),
  },
  'ticari-ileti': {
    slug: 'ticari-ileti',
    title: 'Ticari Elektronik İleti İzni',
    version: '2026-11',
    updatedAt: '2026-10-24',
    draft: true,
    body: MARKETING.trim(),
  },
};
