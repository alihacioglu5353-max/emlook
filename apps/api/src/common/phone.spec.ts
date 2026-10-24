import { maskPhone, normalizeTrPhone } from './phone.js';

describe('normalizeTrPhone', () => {
  it.each([
    ['0532 123 45 67', '+905321234567'],
    ['5321234567', '+905321234567'],
    ['905321234567', '+905321234567'],
    ['+90 (532) 123-45-67', '+905321234567'],
    ['0 532.123.45.67', '+905321234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTrPhone(input)).toBe(expected);
  });

  it.each([
    '0212 123 45 67', // sabit hat
    '532123456', // eksik hane
    '053212345678', // fazla hane
    '+44 7700 900123', // yurt dışı
    'abc',
    '',
  ])('%s geçersiz', (input) => {
    expect(normalizeTrPhone(input)).toBeNull();
  });
});

describe('maskPhone', () => {
  it('ortadaki haneleri gizler', () => {
    expect(maskPhone('+905321234567')).toBe('+90532*****67');
  });
});
