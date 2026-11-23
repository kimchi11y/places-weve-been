import { describe, expect, it } from 'vitest';
import { journalStops, routeSketch } from '../src/lib/journal/stops';
import type { PhotoRow, TripRecord } from '../src/schema/trip';

const photo = (id: string, takenAt: string | null = null) => ({ id, takenAt }) as PhotoRow;
const trip = (stops: { name: string; date: string; photos: PhotoRow[] }[]) => ({ startDate: '2025-04-03', stops }) as TripRecord;
const labels = (photos: PhotoRow[]) => journalStops(trip([{ name: 'Jeju City', date: '2025-04-03', photos }]))[0].groups.map((g) => g.label);

describe('journal stops', () => {
  it('splits photos by day, undated ones last', () => {
    expect(labels([photo('a', '2025-04-03 09:00:00'), photo('b', '2025-04-04 09:00:00'), photo('c')])).toEqual(['Day 1 · Thu 3', 'Day 2 · Fri 4', 'And a few more']);
  });

  it('needs no headings for a single day, or when nothing is dated', () => {
    expect(labels([photo('a', '2025-04-03 09:00:00'), photo('b', '2025-04-03 18:00:00')])).toEqual([undefined]);
    expect(labels([photo('a'), photo('b')])).toEqual([undefined]);
    expect(labels([])).toEqual([]);
  });

  it('numbers photos across the whole trip, past stops without any', () => {
    const stops = journalStops(trip([
      { name: 'A', date: '2025-04-03', photos: [photo('a'), photo('b')] },
      { name: 'B', date: '2025-04-04', photos: [] },
      { name: 'C', date: '2025-04-05', photos: [photo('c', '2025-04-05 09:00:00'), photo('d')] },
    ]));
    expect(stops.map((s) => [s.first, s.total, s.dayNo])).toEqual([[0, 2, 1], [2, 0, 2], [2, 2, 3]]);
    expect(stops.flatMap((s) => s.groups.flatMap((g) => g.tiles.map((t) => t.i)))).toEqual([0, 1, 2, 3]);
  });
});

describe('the route sketch', () => {
  it('fills its box, north up', () => {
    expect(routeSketch([{ lat: 0, lng: 0 }, { lat: 10, lng: 20 }])).toEqual([[20, 90], [180, 20]]);
  });

  it('centres one stop, or several at the same place', () => {
    const here = { lat: 16.05, lng: 108.2 };
    expect(routeSketch([here])).toEqual([[100, 55]]);
    expect(routeSketch([here, here])).toEqual([[100, 55], [100, 55]]);
  });
});
