import { describe, expect, it } from 'vitest';
import { newTripInput, photoUpload, tripInput } from '../src/schema/trip';

const stop = { name: 'Seogwipo', code: 'SGP', lat: 33.25, lng: 126.56, date: '2025-04-07', story: 'Waterfalls.' };
const trip = { title: 'Jeju', startDate: '2025-04-03', endDate: '2025-04-08', countries: ['KR'], summary: 'Islands.', draft: true, stops: [stop] };
const ok = (extra: object) => tripInput.safeParse({ ...trip, ...extra }).success;
const stopOk = (extra: object) => ok({ stops: [{ ...stop, ...extra }] });

describe('what the editor may send', () => {
  it('checks map positions', () => {
    for (const at of [{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }, { lat: 0, lng: 0 }]) expect(stopOk(at)).toBe(true);
    for (const at of [{ lat: 90.01 }, { lat: -90.01 }, { lng: 180.01 }, { lng: -180.01 }, { lat: NaN }, { lng: Infinity }, { lat: '33' }]) expect(stopOk(at)).toBe(false);
  });

  it('checks dates', () => {
    expect(ok({ startDate: '2024-02-29' })).toBe(true);
    for (const startDate of ['2025-02-29', '2025-13-01', '2025-4-3', '', null]) expect(ok({ startDate })).toBe(false);
    expect(newTripInput.safeParse({ ...trip, endDate: trip.startDate }).success).toBe(true); // a day trip
  });

  it('only takes web links for the vlog', () => {
    for (const vlog of ['', '  ', 'https://youtu.be/abc']) expect(ok({ vlog })).toBe(true);
    for (const vlog of ['javascript:alert(1)', 'data:text/html,x', 'youtu.be/abc']) expect(ok({ vlog })).toBe(false);
  });

  it('checks stamp codes, stories and postcards', () => {
    for (const code of ['A', 'ab12', ' SGP ']) expect(stopOk({ code })).toBe(true);
    for (const code of ['', 'ABCDE', 'A-B', '東京']) expect(stopOk({ code })).toBe(false);
    expect(stopOk({ story: '   ' })).toBe(false);
    expect(stopOk({ postcard: ['a', 'b', 'c'] })).toBe(true);
    expect(stopOk({ postcard: ['a', 'b', 'c', 'd'] })).toBe(false);
    expect(ok({ countries: [] })).toBe(false);
  });

  it('checks photo details', () => {
    const photo = { fileName: 'a.jpg', takenAt: null, width: 1, height: 20_000 };
    const photoOk = (extra: object) => photoUpload.safeParse({ ...photo, ...extra }).success;
    expect([photoOk({}), photoOk({ takenAt: '2025-04-03 09:00:00' })]).toEqual([true, true]);
    for (const bad of [{ width: 0 }, { height: 20_001 }, { width: 1.5 }, { fileName: ' ' }, { fileName: 'a'.repeat(201) }, { takenAt: '2025:04:03 09:00:00' }]) expect(photoOk(bad)).toBe(false);
  });
});
