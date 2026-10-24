/**
 * Demo verisinin sabit içeriği: kullanıcılar, ofisler, ilanlar ve etkileşim senaryoları.
 * Fotoğraflar Pexels lisansıyla (ticari kullanım serbest, atıf gerekmez) kullanılır;
 * kimlikleri `photos` alanında, dosyalar `apps/api/demo-photos/<kimlik>.jpg` önbelleğindedir.
 */

export type Verification = 'draft' | 'pending' | 'approved' | 'rejected';

export interface DemoUser {
  phone: string;
  fullName: string;
  role: 'admin' | 'agent' | 'consumer';
  label: string;
  /** Hesabın kaç gün önce açıldığı (grafikler için) */
  days: number;
  agent?: {
    status: Verification;
    license?: string;
    businessName?: string;
    district?: string;
    reason?: string;
    bio?: string;
  };
  office?: { key: OfficeKey; role: 'owner' | 'manager' | 'agent' };
  suspended?: string;
  /** Tabloda/çıktıda gösterilen ana demo hesaplarından mı */
  primary?: boolean;
}

export type OfficeKey = 'yilmaz' | 'bogazici' | 'anadolu' | 'ozturk';

export const OFFICES: Record<
  OfficeKey,
  { name: string; legalName: string; license: string; district: string; status: 'active' | 'pending'; days: number; address: string }
> = {
  yilmaz: {
    name: 'Yılmaz Gayrimenkul Kadıköy',
    legalName: 'Yılmaz Gayrimenkul Danışmanlık Ltd. Şti.',
    license: '3400100',
    district: 'Kadıköy',
    status: 'active',
    days: 140,
    address: 'Caferağa Mah. Moda Cad. No:42',
  },
  bogazici: {
    name: 'Boğaziçi Gayrimenkul Beşiktaş',
    legalName: 'Boğaziçi Gayrimenkul ve Yatırım A.Ş.',
    license: '3400200',
    district: 'Beşiktaş',
    status: 'active',
    days: 120,
    address: 'Sinanpaşa Mah. Ihlamurdere Cad. No:18',
  },
  anadolu: {
    name: 'Anadolu Yakası Emlak Ataşehir',
    legalName: 'Anadolu Yakası Emlak Danışmanlık Ltd. Şti.',
    license: '3400300',
    district: 'Ataşehir',
    status: 'active',
    days: 100,
    address: 'Barbaros Mah. Halk Cad. No:7',
  },
  ozturk: {
    name: 'Öztürk Emlak Moda',
    legalName: 'Can Öztürk Emlak Danışmanlığı',
    license: '3400400',
    district: 'Kadıköy',
    status: 'pending',
    days: 2,
    address: 'Caferağa Mah. Bahariye Cad. No:90',
  },
};

const p = (n: string) => `+90532000${n}`;

export const DEMO_USERS: DemoUser[] = [
  // ---- Ana demo hesapları (0532 000 00 00–09) ----
  { phone: p('0000'), fullName: 'Emlook Yönetici', role: 'admin', label: 'Yönetici', days: 160, primary: true },
  {
    phone: p('0001'), fullName: 'Ayşe Yılmaz', role: 'agent', label: 'Onaylı danışman · ofis sahibi', days: 150, primary: true,
    agent: { status: 'approved', license: '3400001', businessName: 'Yılmaz Gayrimenkul', district: 'Kadıköy', bio: '15 yıldır Kadıköy ve Moda\'da konut danışmanlığı.' },
    office: { key: 'yilmaz', role: 'owner' },
  },
  {
    phone: p('0002'), fullName: 'Mehmet Kaya', role: 'agent', label: 'Onaylı danışman · ofis yöneticisi', days: 145, primary: true,
    agent: { status: 'approved', license: '3400002', businessName: 'Yılmaz Gayrimenkul', district: 'Kadıköy' },
    office: { key: 'yilmaz', role: 'manager' },
  },
  {
    phone: p('0003'), fullName: 'Zeynep Demir', role: 'agent', label: 'Onaylı danışman · ofis üyesi', days: 120, primary: true,
    agent: { status: 'approved', license: '3400003', businessName: 'Yılmaz Gayrimenkul', district: 'Kadıköy' },
    office: { key: 'yilmaz', role: 'agent' },
  },
  {
    phone: p('0004'), fullName: 'Can Öztürk', role: 'agent', label: 'Onaylı danışman · ofis başvurusu bekliyor', days: 110, primary: true,
    agent: { status: 'approved', license: '3400004', businessName: 'Öztürk Emlak', district: 'Kadıköy' },
    office: { key: 'ozturk', role: 'owner' },
  },
  {
    phone: p('0005'), fullName: 'Elif Şahin', role: 'agent', label: 'Danışman · başvuru incelemede', days: 9, primary: true,
    agent: { status: 'pending', license: '3400005', businessName: 'Şahin Emlak', district: 'Maltepe' },
  },
  {
    phone: p('0006'), fullName: 'Burak Arslan', role: 'agent', label: 'Danışman · başvuru reddedildi', days: 25, primary: true,
    agent: { status: 'rejected', license: '3400006', businessName: 'Arslan Emlak', district: 'Pendik', reason: 'Yetki belgesi okunmuyor; net bir kopya yükleyin.' },
  },
  {
    phone: p('0007'), fullName: 'Deniz Koç', role: 'agent', label: 'Danışman · başvuru başlamadı', days: 3, primary: true,
    agent: { status: 'draft' },
  },
  { phone: p('0008'), fullName: 'Selin Aydın', role: 'consumer', label: 'Mülk sahibi / alıcı', days: 40, primary: true },
  {
    phone: p('0009'), fullName: 'Hakan Çelik', role: 'consumer', label: 'Mülk sahibi · askıya alınmış', days: 60, primary: true,
    suspended: 'Demo: kurallara aykırı içerik',
  },

  // ---- Ek danışmanlar (0532 000 01 01–13) ----
  {
    phone: p('0101'), fullName: 'Kerem Aksoy', role: 'agent', label: 'Ofis sahibi', days: 130,
    agent: { status: 'approved', license: '3400101', businessName: 'Boğaziçi Gayrimenkul', district: 'Beşiktaş', bio: 'Boğaz hattında lüks konut ve yatırım.' },
    office: { key: 'bogazici', role: 'owner' },
  },
  {
    phone: p('0102'), fullName: 'Gizem Tunç', role: 'agent', label: 'Ofis yöneticisi', days: 118,
    agent: { status: 'approved', license: '3400102', businessName: 'Boğaziçi Gayrimenkul', district: 'Beşiktaş' },
    office: { key: 'bogazici', role: 'manager' },
  },
  {
    phone: p('0103'), fullName: 'Emre Yıldız', role: 'agent', label: 'Ofis üyesi', days: 90,
    agent: { status: 'approved', license: '3400103', businessName: 'Boğaziçi Gayrimenkul', district: 'Beşiktaş' },
    office: { key: 'bogazici', role: 'agent' },
  },
  {
    phone: p('0104'), fullName: 'Murat Erdem', role: 'agent', label: 'Ofis sahibi', days: 105,
    agent: { status: 'approved', license: '3400104', businessName: 'Anadolu Yakası Emlak', district: 'Ataşehir' },
    office: { key: 'anadolu', role: 'owner' },
  },
  {
    phone: p('0105'), fullName: 'Seda Kılıç', role: 'agent', label: 'Ofis üyesi', days: 84,
    agent: { status: 'approved', license: '3400105', businessName: 'Anadolu Yakası Emlak', district: 'Ataşehir' },
    office: { key: 'anadolu', role: 'agent' },
  },
  {
    phone: p('0106'), fullName: 'Onur Polat', role: 'agent', label: 'Ofis üyesi', days: 70,
    agent: { status: 'approved', license: '3400106', businessName: 'Anadolu Yakası Emlak', district: 'Ataşehir' },
    office: { key: 'anadolu', role: 'agent' },
  },
  {
    phone: p('0107'), fullName: 'Ece Güneş', role: 'agent', label: 'Bağımsız danışman', days: 95,
    agent: { status: 'approved', license: '3400107', businessName: 'Güneş Gayrimenkul', district: 'Sarıyer', bio: 'Sarıyer ve Tarabya\'da villa uzmanı.' },
  },
  {
    phone: p('0108'), fullName: 'Tolga Uçar', role: 'agent', label: 'Bağımsız danışman', days: 77,
    agent: { status: 'approved', license: '3400108', businessName: 'Uçar Emlak', district: 'Üsküdar' },
  },
  {
    phone: p('0109'), fullName: 'Naz Karaca', role: 'agent', label: 'Bağımsız danışman', days: 63,
    agent: { status: 'approved', license: '3400109', businessName: 'Karaca Gayrimenkul', district: 'Bakırköy' },
  },
  {
    phone: p('0110'), fullName: 'Serkan Bulut', role: 'agent', label: 'Bağımsız danışman', days: 48,
    agent: { status: 'approved', license: '3400110', businessName: 'Bulut Emlak', district: 'Beykoz' },
  },
  {
    phone: p('0111'), fullName: 'İrem Yalçın', role: 'agent', label: 'Başvuru incelemede', days: 4,
    agent: { status: 'pending', license: '3400111', businessName: 'Yalçın Emlak', district: 'Şişli' },
  },
  {
    phone: p('0112'), fullName: 'Oğuz Kurt', role: 'agent', label: 'Başvuru incelemede', days: 2,
    agent: { status: 'pending', license: '3400112', businessName: 'Kurt Gayrimenkul', district: 'Ümraniye' },
  },
  {
    phone: p('0113'), fullName: 'Pelin Öz', role: 'agent', label: 'Başvuru incelemede', days: 1,
    agent: { status: 'pending', license: '3400113', businessName: 'Öz Emlak', district: 'Bakırköy' },
  },

  // ---- Ek mülk sahipleri / alıcılar (0532 000 01 21–32) ----
  ...(
    [
      ['0121', 'Ahmet Şen', 88], ['0122', 'Fatma Güler', 81], ['0123', 'Mustafa Özkan', 74], ['0124', 'Emine Aktaş', 66],
      ['0125', 'Ali Yurt', 52], ['0126', 'Hatice Koçak', 45], ['0127', 'Hüseyin Taş', 33], ['0128', 'Merve Ateş', 27],
      ['0129', 'Cem Doğru', 19], ['0130', 'Buse Erol', 12], ['0131', 'Kaan Sezer', 6], ['0132', 'Derya Uysal', 2],
    ] as const
  ).map(([n, fullName, days]) => ({ phone: p(n), fullName, role: 'consumer' as const, label: 'Mülk sahibi / alıcı', days })),
];

/** Grafiklerin dolu görünmesi için 12 haftaya yayılmış ek alıcılar (0532 000 02 01–40) */
const FIRST = ['Arda', 'Bora', 'Ceren', 'Damla', 'Eren', 'Filiz', 'Gökay', 'Hande', 'Ilgaz', 'Jale', 'Kübra', 'Levent', 'Mina', 'Nehir', 'Ozan', 'Pınar', 'Rüzgar', 'Sevgi', 'Taner', 'Ufuk'];
const LAST = ['Akın', 'Bilgin', 'Coşkun', 'Duman', 'Ekinci', 'Fidan', 'Gündoğdu', 'Işık', 'Kaplan', 'Önal'];
DEMO_USERS.push(
  ...Array.from({ length: 40 }, (_, i) => ({
    phone: p('02' + String(i + 1).padStart(2, '0')),
    fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    role: 'consumer' as const,
    label: 'Mülk sahibi / alıcı',
    days: Math.round(84 - i * 2.05 + ((i * 13) % 5)),
  })),
);

export type Category = 'apartment' | 'residence' | 'villa' | 'detached_house' | 'shop' | 'office';

export interface DemoListing {
  owner: string;
  deal: 'sale' | 'rent';
  category: Category;
  title: string;
  district: string;
  /** "Mahallesi" eki olmadan; bulunamazsa boş bırakılır */
  hood?: string;
  price: number;
  gross: number;
  net: number;
  rooms?: string;
  floor: string;
  age: number;
  cobroke?: number;
  visibility?: 'public' | 'network' | 'agents';
  status?: 'active' | 'passive' | 'sold' | 'draft' | 'removed';
  eids?: 'verified' | 'pending';
  /** Pexels fotoğraf kimlikleri; ilki kapak */
  photos: number[];
  /** Kaç gün önce yayımlandı */
  days: number;
  features: string[];
  removedReason?: string;
}

export const LISTINGS: DemoListing[] = [
  { owner: p('0001'), deal: 'sale', category: 'apartment', title: "Moda'da deniz manzaralı yenilenmiş 3+1", district: 'Kadıköy', hood: 'Caferağa', price: 18_750_000, gross: 145, net: 125, rooms: '3+1', floor: '4', age: 22, photos: [1571460, 2724749, 1743229, 3209045], days: 3, features: ['Deniz manzarası', 'Doğalgaz kombi', 'Ankastre mutfak', 'Moda sahiline 5 dakika'] },
  { owner: p('0001'), deal: 'rent', category: 'apartment', title: "Fenerbahçe'de bahçeli 2+1 kiralık", district: 'Kadıköy', hood: 'Fenerbahçe', price: 68_000, gross: 110, net: 95, rooms: '2+1', floor: 'Bahçe katı', age: 15, photos: [1571468, 276554, 271624], days: 9, features: ['Özel bahçe', 'Kapalı otopark', 'Evcil hayvana uygun'] },
  { owner: p('0002'), deal: 'sale', category: 'residence', title: "Kozyatağı'nda havuzlu sitede 2+1 rezidans", district: 'Kadıköy', hood: 'Kozyatağı', price: 13_400_000, gross: 105, net: 88, rooms: '2+1', floor: '12', age: 6, cobroke: 40, photos: [2462015, 6492397, 6585751, 6782567], days: 5, features: ['Açık ve kapalı havuz', '7/24 güvenlik', 'Fitness salonu', 'Metroya yürüme mesafesi'] },
  { owner: p('0002'), deal: 'sale', category: 'apartment', title: "Göztepe'de metroya 5 dakika 3+1 daire", district: 'Kadıköy', hood: 'Göztepe', price: 15_900_000, gross: 135, net: 118, rooms: '3+1', floor: '3', age: 12, visibility: 'agents', photos: [1643383, 2635038, 1457842], days: 16, features: ['Asansör', 'Ebeveyn banyosu', 'Krediye uygun'] },
  { owner: p('0003'), deal: 'rent', category: 'apartment', title: "Suadiye'de eşyalı 1+1 kiralık", district: 'Kadıköy', hood: 'Suadiye', price: 52_000, gross: 70, net: 60, rooms: '1+1', floor: '2', age: 8, photos: [3209045, 276554], days: 2, features: ['Eşyalı', 'Bağdat Caddesi\'ne 2 dakika', 'Klima'] },
  { owner: p('0003'), deal: 'sale', category: 'apartment', title: "Acıbadem'de geniş 4+1 aile dairesi", district: 'Kadıköy', hood: 'Acıbadem', price: 21_500_000, gross: 190, net: 165, rooms: '4+1', floor: '5', age: 18, visibility: 'network', photos: [1918291, 2635038, 1743229, 259962], days: 24, features: ['Okullara yakın', 'İki banyo', 'Geniş balkon'] },
  { owner: p('0004'), deal: 'sale', category: 'apartment', title: "Bostancı'da sahile yakın 2+1", district: 'Kadıköy', hood: 'Bostancı', price: 11_250_000, gross: 95, net: 82, rooms: '2+1', floor: '1', age: 25, photos: [1571463, 2724749], days: 33, features: ['Sahile 300 m', 'Marmaray\'a yakın', 'Yenilenmiş banyo'] },
  { owner: p('0004'), deal: 'rent', category: 'office', title: "Kozyatağı'nda plaza katı ofis", district: 'Kadıköy', hood: 'Kozyatağı', price: 145_000, gross: 260, net: 230, floor: '8', age: 10, visibility: 'agents', photos: [2251247, 2440471], days: 41, features: ['Toplantı odası', 'Merkezi klima', 'Jeneratör'] },
  { owner: p('0101'), deal: 'sale', category: 'apartment', title: "Bebek'te Boğaz manzaralı 3+1", district: 'Beşiktaş', hood: 'Bebek', price: 64_000_000, gross: 175, net: 150, rooms: '3+1', floor: '3', age: 30, photos: [323780, 2121121, 6585751, 1743229], days: 6, features: ['Tam Boğaz manzarası', 'Vale otopark', 'Bebek sahiline yürüme'] },
  { owner: p('0101'), deal: 'rent', category: 'residence', title: "Levent'te rezidans 1+1 kiralık", district: 'Beşiktaş', hood: 'Levent', price: 95_000, gross: 80, net: 65, rooms: '1+1', floor: '21', age: 5, photos: [2462015, 1457842, 6782567], days: 11, features: ['Concierge', 'Metroya bağlantı', 'Spa'] },
  { owner: p('0102'), deal: 'sale', category: 'apartment', title: "Ortaköy'de tarihi binada 2+1", district: 'Beşiktaş', hood: 'Ortaköy', price: 24_900_000, gross: 120, net: 100, rooms: '2+1', floor: '2', age: 60, photos: [2079246, 1080721, 271624], days: 19, features: ['Yüksek tavan', 'Restore edilmiş', 'Meydana 2 dakika'] },
  { owner: p('0102'), deal: 'sale', category: 'villa', title: "Zekeriyaköy'de havuzlu müstakil villa", district: 'Sarıyer', hood: 'Zekeriyaköy', price: 78_500_000, gross: 420, net: 360, rooms: '6+2', floor: 'Villa', age: 9, cobroke: 40, visibility: 'agents', photos: [8134821, 1571460, 2635038, 6782567, 276724], days: 27, features: ['Özel havuz', '1.200 m² bahçe', 'Akıllı ev sistemi', 'Şömine'] },
  { owner: p('0103'), deal: 'rent', category: 'apartment', title: "Etiler'de bakımlı 3+1 kiralık", district: 'Beşiktaş', hood: 'Etiler', price: 120_000, gross: 160, net: 140, rooms: '3+1', floor: '4', age: 20, photos: [1648776, 2724749, 1743229], days: 7, features: ['Kapalı otopark', 'Kapıcı', 'Nispetiye Caddesi\'ne yakın'] },
  { owner: p('0103'), deal: 'sale', category: 'shop', title: "Beşiktaş Çarşı'da köşe dükkân", district: 'Beşiktaş', hood: 'Sinanpaşa', price: 32_000_000, gross: 85, net: 80, floor: 'Zemin', age: 35, visibility: 'agents', photos: [2251247], days: 45, features: ['Köşe başı', 'Yüksek yaya trafiği', 'Kiracılı (aylık 210.000 TL)'] },
  { owner: p('0104'), deal: 'sale', category: 'residence', title: "Ataşehir'de finans merkezine yakın 3+1 rezidans", district: 'Ataşehir', hood: 'Barbaros', price: 26_750_000, gross: 165, net: 140, rooms: '3+1', floor: '18', age: 4, photos: [2119714, 2121121, 276554, 6782567], days: 4, features: ['Finans Merkezi\'ne 5 dakika', 'Kapalı havuz', 'Çocuk oyun alanı'] },
  { owner: p('0104'), deal: 'rent', category: 'apartment', title: "Ataşehir'de site içi 2+1 kiralık", district: 'Ataşehir', hood: 'Atatürk', price: 62_000, gross: 115, net: 98, rooms: '2+1', floor: '7', age: 11, photos: [2462015, 1571463, 271624], days: 13, features: ['Site içi', 'Kapalı otopark', 'Spor salonu'] },
  { owner: p('0105'), deal: 'sale', category: 'apartment', title: "Ataşehir'de yeni binada yatırımlık 1+1", district: 'Ataşehir', hood: 'Küçükbakkalköy', price: 7_450_000, gross: 65, net: 55, rooms: '1+1', floor: '6', age: 2, photos: [6492397, 276554], days: 21, features: ['Kira getirisi yüksek', 'Sıfır bina', 'Otoparklı'] },
  { owner: p('0105'), deal: 'sale', category: 'detached_house', title: "Kuzguncuk'ta restore edilmiş ahşap ev", district: 'Üsküdar', hood: 'Kuzguncuk', price: 34_000_000, gross: 180, net: 150, rooms: '4+1', floor: 'Müstakil', age: 80, photos: [2102587, 2079246, 1080721, 259962], days: 36, features: ['Tarihi doku', 'Özel bahçe', 'Boğaz\'a 3 dakika'] },
  { owner: p('0106'), deal: 'rent', category: 'office', title: "Ataşehir'de 6 odalı ofis katı", district: 'Ataşehir', hood: 'Barbaros', price: 180_000, gross: 320, net: 290, floor: '10', age: 7, visibility: 'agents', photos: [2440471, 2251247], days: 52, features: ['6 oda + toplantı salonu', 'Fiber altyapı', 'Otopark (4 araç)'] },
  { owner: p('0106'), deal: 'sale', category: 'apartment', title: "Maltepe'de deniz manzaralı 3+1", district: 'Maltepe', hood: 'Bağlarbaşı', price: 12_600_000, gross: 140, net: 122, rooms: '3+1', floor: '9', age: 9, photos: [1643383, 1080721, 1457842], days: 15, features: ['Adalar manzarası', 'Sahil parkına yürüme', 'Asansör'] },
  { owner: p('0107'), deal: 'sale', category: 'villa', title: "Tarabya'da Boğaz manzaralı villa", district: 'Sarıyer', hood: 'Tarabya', price: 115_000_000, gross: 480, net: 410, rooms: '7+2', floor: 'Villa', age: 14, cobroke: 40, photos: [1396122, 1571460, 2121121, 6585751, 6782567], days: 10, features: ['Boğaz manzarası', 'Özel iskele erişimi', 'Asansörlü', 'Personel dairesi'] },
  { owner: p('0107'), deal: 'rent', category: 'villa', title: "İstinye'de bahçeli müstakil ev kiralık", district: 'Sarıyer', hood: 'İstinye', price: 260_000, gross: 300, net: 260, rooms: '5+1', floor: 'Müstakil', age: 20, visibility: 'network', photos: [280222, 1918291, 2724749], days: 30, features: ['Geniş bahçe', 'İstinye Park\'a 5 dakika', 'Şömine'] },
  { owner: p('0108'), deal: 'sale', category: 'apartment', title: "Altunizade'de site içinde 3+1", district: 'Üsküdar', hood: 'Altunizade', price: 17_900_000, gross: 150, net: 130, rooms: '3+1', floor: '5', age: 7, photos: [1648776, 2635038, 1743229], days: 8, features: ['Metrobüs ve metroya yakın', 'Site içi', 'Çocuk parkı'] },
  { owner: p('0108'), deal: 'rent', category: 'apartment', title: "Çengelköy'de Boğaz'a yürüme mesafesinde 2+1", district: 'Üsküdar', hood: 'Çengelköy', price: 75_000, gross: 100, net: 88, rooms: '2+1', floor: '1', age: 28, photos: [1571468, 276554], days: 18, features: ['Sahile 200 m', 'Sessiz sokak', 'Yenilenmiş'] },
  { owner: p('0109'), deal: 'sale', category: 'apartment', title: "Yeşilköy'de bahçeli 3+1", district: 'Bakırköy', hood: 'Yeşilköy', price: 23_400_000, gross: 160, net: 140, rooms: '3+1', floor: 'Bahçe katı', age: 16, photos: [5997993, 1571463, 2724749, 271624], days: 12, features: ['Özel bahçe', 'Marmaray\'a yakın', 'Kapalı otopark'] },
  { owner: p('0109'), deal: 'sale', category: 'residence', title: "Ataköy'de marina manzaralı 2+1", district: 'Bakırköy', price: 19_800_000, gross: 125, net: 105, rooms: '2+1', floor: '14', age: 5, photos: [2462015, 6492397, 6782567], days: 22, features: ['Marina manzarası', 'Havuz', 'AVM\'ye yürüme'] },
  { owner: p('0110'), deal: 'sale', category: 'villa', title: "Riva'da doğa içinde müstakil villa", district: 'Beykoz', hood: 'Riva', price: 38_500_000, gross: 350, net: 300, rooms: '5+2', floor: 'Villa', age: 6, photos: [5997993, 1974596, 1571460, 276724], days: 26, features: ['Orman manzarası', 'Plaja 1 km', 'Barbekü alanı'] },
  { owner: p('0110'), deal: 'sale', category: 'detached_house', title: "Kavacık'ta bahçeli müstakil ev", district: 'Beykoz', hood: 'Kavacık', price: 29_000_000, gross: 260, net: 220, rooms: '4+1', floor: 'Müstakil', age: 12, photos: [2287310, 1643383, 2635038], days: 40, features: ['FSM Köprüsü\'ne 3 dakika', 'Bahçe', 'Kapalı garaj'] },
  { owner: p('0104'), deal: 'sale', category: 'villa', title: "Çekmeköy'de site içi tripleks villa", district: 'Çekmeköy', price: 42_000_000, gross: 380, net: 320, rooms: '5+1', floor: 'Tripleks', age: 3, photos: [106399, 1918291, 2724749, 6782567], days: 58, features: ['Site içi havuz', 'Akıllı ev', 'Özel otopark'] },
  { owner: p('0101'), deal: 'sale', category: 'apartment', title: "Nişantaşı'nda klasik binada 3+1", district: 'Şişli', hood: 'Teşvikiye', price: 39_500_000, gross: 170, net: 150, rooms: '3+1', floor: '4', age: 45, status: 'sold', photos: [259962, 1080721, 1743229], days: 70, features: ['Klasik bina', 'Yüksek tavan', 'Abdi İpekçi\'ye yakın'] },
  { owner: p('0001'), deal: 'sale', category: 'apartment', title: "Rasimpaşa'da yatırımlık 2+1", district: 'Kadıköy', hood: 'Rasimpaşa', price: 9_850_000, gross: 90, net: 78, rooms: '2+1', floor: '3', age: 30, status: 'passive', photos: [1571463, 276554], days: 64, features: ['İskeleye yürüme', 'Kiracılı'] },
  { owner: p('0108'), deal: 'sale', category: 'apartment', title: "Ümraniye'de yeni projede 2+1", district: 'Ümraniye', price: 8_900_000, gross: 110, net: 92, rooms: '2+1', floor: '8', age: 1, status: 'draft', eids: 'pending', photos: [2119714, 6492397], days: 1, features: ['Sıfır daire', 'Metroya yakın'] },
  { owner: p('0003'), deal: 'sale', category: 'apartment', title: "Erenköy'de bahçe dubleks 4+1", district: 'Kadıköy', hood: 'Erenköy', price: 27_500_000, gross: 220, net: 190, rooms: '4+1', floor: 'Bahçe dubleks', age: 10, status: 'draft', eids: 'pending', photos: [1918291, 2635038], days: 1, features: ['Dubleks', 'Özel bahçe', 'İki otopark'] },
  { owner: p('0103'), deal: 'rent', category: 'apartment', title: "Abbasağa'da 1+1 kiralık", district: 'Beşiktaş', price: 55_000, gross: 60, net: 50, rooms: '1+1', floor: '2', age: 40, status: 'removed', removedReason: 'Gerçek dışı fiyat ve mükerrer ilan şikâyeti (demo)', photos: [3209045], days: 50, features: ['Merkezi konum'] },
];

/** İlgi talepleri: [isteyen telefonu, ilan sırası, durum, not, kaç gün önce] */
export const INTERESTS: [string, number, 'pending' | 'accepted' | 'declined' | 'withdrawn', string | null, number][] = [
  [p('0008'), 0, 'accepted', 'Hafta sonu görmek isterim.', 2],
  [p('0008'), 8, 'pending', null, 1],
  [p('0008'), 14, 'pending', 'Krediyle alım düşünüyorum.', 0],
  [p('0121'), 0, 'pending', null, 1],
  [p('0122'), 2, 'accepted', 'Site aidatı ne kadar?', 4],
  [p('0123'), 6, 'declined', null, 20],
  [p('0124'), 22, 'accepted', null, 6],
  [p('0125'), 20, 'pending', 'Yabancı uyruklu alıcı için uygun mu?', 3],
  [p('0126'), 24, 'accepted', null, 9],
  [p('0127'), 12, 'pending', null, 2],
  [p('0128'), 1, 'accepted', 'Evcil hayvanım var, sorun olur mu?', 7],
  [p('0107'), 0, 'accepted', 'Alıcım var, ortak çalışalım.', 2],
  [p('0004'), 8, 'pending', 'Portföyümde bu bütçede alıcı var.', 1],
  [p('0129'), 15, 'withdrawn', null, 11],
  [p('0130'), 26, 'accepted', null, 5],
  [p('0131'), 9, 'pending', null, 1],
  [p('0132'), 16, 'declined', null, 1],
  [p('0002'), 14, 'accepted', 'Ofisimizde uygun bir müşteri var.', 3],
  [p('0121'), 19, 'pending', null, 0],
  [p('0122'), 10, 'pending', null, 2],
];

/** Eşleşen konuşmalarda geçen örnek yazışma (sıra: isteyen, ilan sahibi, isteyen…) */
export const CHAT_SCRIPTS: string[][] = [
  ['Merhaba, ilanla ilgileniyorum. Cumartesi öğleden sonra müsait misiniz?', 'Merhaba, tabii. Saat 14:00 uygun olur mu?', 'Olur, adresi paylaşabilir misiniz?', 'Konum ve kat bilgisini birazdan gönderiyorum. Görüşmek üzere!'],
  ['İyi günler, aidat ve ısınma giderleri ne kadar?', 'Aidat aylık 3.200 TL, doğalgaz kombili. Kış aylarında ortalama 2.500 TL geliyor.', 'Teşekkürler, eşimle birlikte görmek isteriz.'],
  ['Merhaba, krediye uygunluğu var mı?', 'Evet, tapu temiz ve iskânlı; krediye uygun.', 'Harika, ekspertiz için bankayla görüşüyorum.', 'Ben de gerekli belgeleri hazırlarım.'],
  ['Merhaba, alıcım ilanınızla ilgileniyor. Komisyon paylaşımını %50 olarak teyit edebilir miyiz?', 'Merhaba, evet %50-%50 çalışıyoruz. Gösterim için yarın uygun musunuz?', 'Yarın 11:00 olur. Alıcı bilgilerini Emlook üzerinden ileteceğim.'],
];

/** Ödeme talepleri */
export interface DemoPayment {
  creator: string;
  listing: number;
  buyerAgent?: string;
  buyerShare?: number;
  payer: string;
  amountTl: number;
  status: 'paid' | 'open' | 'expired' | 'cancelled';
  days: number;
  description: string;
}

export const PAYMENTS: DemoPayment[] = [
  { creator: p('0101'), listing: 29, buyerAgent: p('0004'), buyerShare: 50, payer: 'Okan Demirtaş', amountTl: 1_185_000, status: 'paid', days: 68, description: 'Nişantaşı 3+1 satış hizmet bedeli' },
  { creator: p('0001'), listing: 1, payer: 'Deniz Kara', amountTl: 68_000, status: 'paid', days: 140, description: 'Fenerbahçe 2+1 kiralama hizmet bedeli' },
  { creator: p('0104'), listing: 15, payer: 'Sibel Yaman', amountTl: 62_000, status: 'paid', days: 118, description: 'Ataşehir 2+1 kiralama hizmet bedeli' },
  { creator: p('0107'), listing: 21, buyerAgent: p('0108'), buyerShare: 50, payer: 'Yusuf Aksu', amountTl: 260_000, status: 'paid', days: 96, description: 'İstinye müstakil kiralama hizmet bedeli' },
  { creator: p('0002'), listing: 3, payer: 'Gökhan Ersoy', amountTl: 477_000, status: 'paid', days: 44, description: 'Göztepe 3+1 satış hizmet bedeli' },
  { creator: p('0109'), listing: 24, buyerAgent: p('0103'), buyerShare: 40, payer: 'Aylin Tekin', amountTl: 702_000, status: 'paid', days: 29, description: 'Yeşilköy 3+1 satış hizmet bedeli' },
  { creator: p('0101'), listing: 9, payer: 'Berk Yazıcı', amountTl: 95_000, status: 'paid', days: 11, description: 'Levent rezidans kiralama hizmet bedeli' },
  { creator: p('0003'), listing: 4, payer: 'Nil Aydoğan', amountTl: 52_000, status: 'paid', days: 3, description: 'Suadiye 1+1 kiralama hizmet bedeli' },
  { creator: p('0001'), listing: 0, payer: 'Kemal Sarı', amountTl: 562_500, status: 'open', days: 2, description: 'Moda 3+1 satış hizmet bedeli' },
  { creator: p('0104'), listing: 14, payer: 'Orhan Kaya', amountTl: 802_500, status: 'open', days: 1, description: 'Ataşehir rezidans satış hizmet bedeli' },
  { creator: p('0102'), listing: 10, payer: 'Tuba Er', amountTl: 747_000, status: 'expired', days: 20, description: 'Ortaköy 2+1 satış hizmet bedeli' },
  { creator: p('0105'), listing: 16, payer: 'Melis Ak', amountTl: 223_500, status: 'cancelled', days: 9, description: 'Ataşehir 1+1 satış hizmet bedeli' },
];

/** IBAN hesabı olan danışmanlar (olmayanların payı "held" kalır) */
export const PAYOUT_AGENTS = [p('0001'), p('0002'), p('0003'), p('0101'), p('0104'), p('0107'), p('0109')];

/** Şikâyetler: [şikâyet eden, ilan sırası, sebep, not, durum, kaç gün önce] */
export const REPORTS: [string, number, 'misleading' | 'wrong_price' | 'not_available' | 'duplicate' | 'fraud' | 'other', string, 'open' | 'resolved' | 'dismissed', number][] = [
  [p('0121'), 19, 'wrong_price', 'Telefonda ilandakinden farklı fiyat söylendi.', 'open', 1],
  [p('0125'), 6, 'not_available', 'Arayınca satıldığını söylediler.', 'open', 3],
  [p('0128'), 25, 'misleading', 'Fotoğraflar başka bir daireye ait olabilir.', 'open', 2],
  [p('0004'), 12, 'duplicate', 'Aynı daire başka bir ilanda da var.', 'open', 5],
  [p('0130'), 33, 'fraud', 'Kapora istendi, daire gösterilmedi.', 'resolved', 48],
  [p('0122'), 2, 'other', 'Site aidatı yazılmamış.', 'dismissed', 20],
];
