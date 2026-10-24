import { cleanNeighbourhoodName } from '../db/seed-locations.js';
import { normalizeForSearch } from './text.js';

describe('normalizeForSearch', () => {
  it('Türkçe karakterleri sadeleştirir ve küçültür', () => {
    expect(normalizeForSearch('İSTANBUL Kadıköy Çağlayan Şişli Göztepe Ünalan')).toBe(
      'istanbul kadikoy caglayan sisli goztepe unalan',
    );
  });

  it('oda sayısındaki + işaretini korur, noktalamayı atar', () => {
    expect(normalizeForSearch('3+1,  satılık daire!')).toBe('3+1 satilik daire');
  });
});

describe('cleanNeighbourhoodName', () => {
  it('"Mah" kısaltmasını açar', () => {
    expect(cleanNeighbourhoodName('Bostancı Mah')).toBe('Bostancı Mahallesi');
    expect(cleanNeighbourhoodName('Merkez (Yeni Mah)')).toBe('Merkez (Yeni Mahallesi)');
    expect(cleanNeighbourhoodName('Akçaköy Köyü')).toBe('Akçaköy Köyü');
  });
});
