import { describe, expect, it } from 'vitest';
import { searchTrips, splitMatch } from '../src/lib/search';
import type { Trip } from '../src/lib/types';

const trip = (title: string, stops: string[], more: Partial<Trip> = {}) =>
  ({ title, year: 2021, when: 'Aug 2021', countryNames: [], continents: [], stops: stops.map((name) => ({ name })), ...more }) as unknown as Trip;
const iceland = trip('Iceland', ['Reykjavík', 'Vík'], { countryNames: ['Iceland'], continents: ['Europe'] });
const turkey = trip('Lokum', ['Istanbul'], { year: 2019, when: 'May 2019', countryNames: ['Türkiye'], continents: ['Asia'] });
const found = (query: string) => searchTrips([iceland, turkey], query).map((h) => [h.trip.title, h.stopIndex]);

describe('searching trips', () => {
  it('lists every trip for a blank query', () => {
    for (const query of ['', '   ']) expect(found(query)).toEqual([['Iceland', null], ['Lokum', null]]);
    expect(searchTrips([], 'x')).toEqual([]);
  });

  it('ignores accents, case and spaces around the query', () => {
    expect(found(' REYKJAVIK ')).toEqual([['Iceland', 0]]);
    expect(found('reykjavík')).toEqual([['Iceland', 0]]);
    expect(found('turkiye')).toEqual([['Lokum', null]]);
  });

  it('finds trips by title, year, month, country and continent, and says when it was a stop', () => {
    expect(found('lokum')).toEqual([['Lokum', null]]);
    expect(found('2019')).toEqual([['Lokum', null]]);
    expect(found('aug')).toEqual([['Iceland', null]]);
    expect(found('europe')).toEqual([['Iceland', null]]);
    expect(found('vik')).toEqual([['Iceland', 0]]); // the first stop that matches
    expect(found('atlantis')).toEqual([]);
  });

  it('takes punctuation literally', () => {
    expect(found('.*')).toEqual([]);
    expect(found('(')).toEqual([]);
  });
});

describe('highlighting', () => {
  it('splits around the first match', () => {
    expect(splitMatch('Reykjavík', 'javik')).toEqual(['Reyk', 'javík', '']);
    expect(splitMatch('Banana', 'an')).toEqual(['B', 'an', 'ana']);
    expect(splitMatch('Istanbul', 'x')).toEqual(['Istanbul', '', '']);
    expect(splitMatch('Istanbul', ' ')).toEqual(['Istanbul', '', '']);
    expect(splitMatch('', 'x')).toEqual(['', '', '']);
  });

  it('keeps Korean syllables whole', () => {
    expect(splitMatch('서울 여행', '여행')).toEqual(['서울 ', '여행', '']);
  });

  it('never loses a character, however accents are stored', () => {
    for (const text of ['Reykjavík', 'Türkiye', 'ﬁn', 'İzmir']) {
      for (const query of ['i', 'k', 'r', 'n']) expect(splitMatch(text, query).join('')).toBe(text);
    }
  });
});
