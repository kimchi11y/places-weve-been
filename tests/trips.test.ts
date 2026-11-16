import { describe, expect, it } from 'vitest';
import { countryName, isCountryCode, numericId } from '../src/lib/countries';
import { dateRange, daysBetween } from '../src/lib/format';
import { inkFor, INKS } from '../src/lib/ink';
import { coverPhoto, postcardPhotos, toTrip } from '../src/lib/trips';
import type { PhotoRow, TripRecord } from '../src/schema/trip';

const photo = (id: string, postcard: number | null = null): PhotoRow => ({
  id, postcard, tripId: 't', stopId: 's', fileName: `${id}.jpg`, takenAt: null, width: 2000, height: 1500, createdAt: '',
});
const stopOf = (name: string, photos: PhotoRow[]) => ({
  id: name, tripId: 't', position: 0, name, code: 'REK', lat: 64.15, lng: -21.94, date: '2021-08-14',
  story: 'Hot dogs.', notes: [], createdAt: '', updatedAt: '', photos,
});
const trip = (stops: TripRecord['stops'], coverPhotoId: string | null = null): TripRecord => ({
  id: 'iceland-2021', title: 'Iceland', startDate: '2021-08-14', endDate: '2021-08-20', countries: ['IS'],
  summary: 'Midnight sun.', story: '', vlog: null, draft: false, coverPhotoId, createdAt: '', updatedAt: '', stops,
});

describe('postcards and covers', () => {
  it('uses the picked postcard photos in their order, or else the first three', () => {
    expect(postcardPhotos(stopOf('A', [photo('a'), photo('b', 1), photo('c', 0)])).map((p) => p.id)).toEqual(['c', 'b']);
    expect(postcardPhotos(stopOf('A', ['a', 'b', 'c', 'd'].map((id) => photo(id)))).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it("uses the picked cover, or else the first stop's first postcard photo", () => {
    const stops = [stopOf('A', [photo('a'), photo('b', 0)]), stopOf('B', [photo('c')])];
    expect(coverPhoto(trip(stops, 'c'))!.id).toBe('c');
    expect(coverPhoto(trip(stops))!.id).toBe('b');
  });
});

describe('toTrip', () => {
  it('turns a stored trip into what the globe shows', () => {
    const t = toTrip(trip([stopOf('Reykjavík', ['a', 'b', 'c', 'd'].map((id) => photo(id)))]));
    expect(t).toMatchObject({ year: 2021, dates: '14 – 20 Aug 2021', when: 'Aug 2021', days: 7, countryIds: ['352'], countryNames: ['Iceland'] });
    expect(t.cover).toEqual({ src: '/photos/a/card', tile: '/photos/a/tile', thumb: '/photos/a/thumb' });
    expect(t.photoCount).toBe(4);
    expect(t.stops[0]).toMatchObject({ slug: 'reykjavik', coord: [-21.94, 64.15], date: '14 August 2021', dateShort: '14 Aug', dayNo: 1, more: 1 });
    expect(t.stops[0].photos[0]).toEqual({ src: '/photos/a/card', tile: '/photos/a/tile', thumb: '/photos/a/thumb' });
  });
});

describe('trip inks', () => {
  it('keeps each trip in the same ink, whatever other trips exist', () => {
    expect(inkFor('iceland-2021')).toBe(inkFor('iceland-2021'));
    expect(INKS).toContain(inkFor('a-trip-that-is-new'));
    expect(toTrip(trip([stopOf('A', [photo('a')])])).ink).toBe(inkFor('iceland-2021').ink);
  });
});

describe('formatting', () => {
  it('writes date ranges and counts days inclusively', () => {
    expect(dateRange('2025-09-29', '2025-10-03')).toBe('29 Sep – 3 Oct 2025');
    expect(dateRange('2024-12-30', '2025-01-02')).toBe('30 Dec – 2 Jan 2025');
    expect(daysBetween('2025-04-03', '2025-04-03')).toBe(1);
  });

  it('knows countries by code', () => {
    expect([isCountryCode('KR'), isCountryCode('XX')]).toEqual([true, false]);
    expect(numericId('KR')).toBe('410');
    expect(countryName('KR')).toBe('South Korea');
  });
});
