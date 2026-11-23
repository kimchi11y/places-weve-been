import { describe, expect, it } from 'vitest';
import { slugify } from '../src/lib/slug';

describe('slugs', () => {
  it('keeps the ones Latin names have always had', () => {
    expect(['Seongsan Ilchulbong', 'Reykjavík', 'Jökulsárlón', ' São  Paulo! ', "L'Île-d'Yeu", 'Jeju 2025'].map(slugify)).toEqual([
      'seongsan-ilchulbong', 'reykjavik', 'jokulsarlon', 'sao-paulo', 'l-ile-d-yeu', 'jeju-2025',
    ]);
  });

  it('spells out letters that aren’t just an accent', () => {
    expect(['Øresund', 'Łódź', 'Straße', 'Ærø', 'Þingvellir', 'Đà Nẵng', 'İzmir', 'Iğdır'].map(slugify)).toEqual([
      'oresund', 'lodz', 'strasse', 'aero', 'thingvellir', 'da-nang', 'izmir', 'igdir',
    ]);
  });

  it('keeps other scripts, accents included', () => {
    expect(['東京 2024', '서울', 'ながさき', 'Москва́', 'กรุงเทพฯ', 'दिल्ली', 'القاهرة'].map(slugify)).toEqual([
      '東京-2024', '서울', 'ながさき', 'москва', 'กรุงเทพฯ', 'दिल्ली', 'القاهرة',
    ]);
    expect(slugify('ながさき'.normalize('NFD'))).toBe(slugify('ながさき'));
    expect(slugify('서울'.normalize('NFD'))).toBe('서울');
  });

  it('is safe in an address', () => {
    for (const name of ['a/b', '../x', 'a?b#c', '100%', '<b>']) expect(slugify(name)).toMatch(/^[a-z0-9-]*$/);
    expect(['🏝️', '!!!', ''].map(slugify)).toEqual(['', '', '']);
  });
});
