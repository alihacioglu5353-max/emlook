import { fold, parseQuery, type LocationIndex } from './parse-query.js';

const idx: LocationIndex = {
  cities: [
    { code: '34', name: 'İstanbul' },
    { code: '06', name: 'Ankara' },
    { code: '35', name: 'İzmir' },
    { code: '07', name: 'Antalya' },
  ].map((c) => ({ ...c, norm: fold(c.name) })),
  districts: [
    { id: 1, cityCode: '34', name: 'Kadıköy' },
    { id: 2, cityCode: '34', name: 'Beşiktaş' },
    { id: 3, cityCode: '06', name: 'Çankaya' },
    { id: 4, cityCode: '35', name: 'Karşıyaka' },
    { id: 5, cityCode: '07', name: 'Merkez' },
    { id: 6, cityCode: '06', name: 'Merkez' },
    { id: 7, cityCode: '34', name: 'Ataşehir' },
  ].map((d) => ({ ...d, norm: fold(d.name) })),
};

describe('parseQuery', () => {
  it('ilçe, tip, oda, kategori ve fiyat üst sınırı', () => {
    expect(parseQuery('Kadıköy satılık 3+1 daire 10 milyon altı', idx)).toEqual({
      dealType: 'sale',
      category: 'apartment',
      rooms: '3+1',
      maxPrice: 10_000_000,
      city: { code: '34', name: 'İstanbul' },
      district: { id: 1, name: 'Kadıköy', cityCode: '34' },
      text: [],
    });
  });

  it('kiralık, binli fiyat aralığı ve serbest metin', () => {
    const p = parseQuery('beşiktaş kiralık 20-35 bin deniz manzaralı', idx);
    expect(p).toMatchObject({ dealType: 'rent', minPrice: 20_000, maxPrice: 35_000, district: { id: 2 } });
    expect(p.text).toEqual(['deniz', 'manzarali']);
  });

  it('binlik ayırıcılı TL ve "üstü"', () => {
    expect(parseQuery('15.000.000 tl üstü villa', idx)).toMatchObject({ minPrice: 15_000_000, category: 'villa' });
    expect(parseQuery('2,5 milyon', idx)).toMatchObject({ maxPrice: 2_500_000 });
  });

  it('metrekare: aralık ve sınırlar', () => {
    expect(parseQuery('120 m2 daire', idx)).toMatchObject({ minM2: 102, maxM2: 138 });
    expect(parseQuery('100 metrekare üstü', idx)).toMatchObject({ minM2: 100 });
    expect(parseQuery('80m2 altı', idx)).toMatchObject({ maxM2: 80 });
  });

  it('stüdyo, müstakil ev, iş yeri', () => {
    expect(parseQuery('stüdyo kiralık', idx)).toMatchObject({ rooms: 'Stüdyo', dealType: 'rent' });
    expect(parseQuery('1+0', idx)).toMatchObject({ rooms: 'Stüdyo' });
    expect(parseQuery('müstakil ev bahçeli', idx)).toMatchObject({ category: 'detached_house', text: ['bahceli'] });
    expect(parseQuery('kiralık iş yeri', idx)).toMatchObject({ category: 'shop', dealType: 'rent' });
  });

  it('belirsiz ilçe adı ancak il ile çözülür', () => {
    expect(parseQuery('merkez daire', idx)).toMatchObject({ text: ['merkez'] });
    expect(parseQuery('merkez daire', idx).district).toBeUndefined();
    expect(parseQuery('ankara merkez', idx)).toMatchObject({ city: { code: '06' }, district: { id: 6 } });
  });

  it('yalnızca il', () => {
    const p = parseQuery('İzmir satılık arsa', idx);
    expect(p).toMatchObject({ city: { code: '35' }, category: 'land', dealType: 'sale' });
    expect(p.district).toBeUndefined();
  });
});
