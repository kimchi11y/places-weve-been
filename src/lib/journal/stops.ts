/** Turns a trip's stops into what the journal page draws: walls of photos, split by the day they were taken. */
import { DAY, fmtShort, fmtWeekday, parseDay } from '../format';
import { slugify } from '../slug';
import type { PhotoRow, TripRecord } from '../../schema/trip';

export interface Tile { photo: PhotoRow; i: number; label: string; tilt: number }
export interface Group { label?: string; tiles: Tile[] }
export type JournalStop = TripRecord['stops'][number] & { day: Date; dayNo: number; slug: string; groups: Group[]; first: number; total: number };

// Photos land a little crooked, and never the same way twice in a row
const TILTS = [-1.6, 1.2, -0.8, 1.7, -1.2, 0.9];

/** Split a stop's photos by the day they were taken. Undated photos form a last group. */
function groupByDay(photos: PhotoRow[], start: Date) {
  const days = new Map<string, PhotoRow[]>();
  for (const p of photos) {
    const day = p.takenAt?.slice(0, 10) ?? '';
    days.set(day, [...(days.get(day) ?? []), p]);
  }
  if (days.size < 2) return [{ label: undefined, photos }];
  return [...days].map(([day, photos]) => {
    if (!day) return { label: 'And a few more', photos };
    const date = parseDay(day);
    return { label: `Day ${Math.round((+date - +start) / DAY) + 1} · ${fmtWeekday.format(date)}`, photos };
  });
}

export function journalStops(trip: TripRecord): JournalStop[] {
  const start = parseDay(trip.startDate);
  // Every photo gets one running number: that order is the viewer's timeline.
  let count = 0;
  return trip.stops.map((s) => {
    const day = parseDay(s.date);
    const first = count;
    const groups = groupByDay(s.photos, start).filter((g) => g.photos.length).map((g) => {
      const label = `${s.name}, ${g.label ?? fmtShort.format(day)}`;
      return { label: g.label, tiles: g.photos.map((photo) => ({ photo, label, i: count, tilt: TILTS[count++ % TILTS.length] })) };
    });
    return { ...s, day, dayNo: Math.round((+day - +start) / DAY) + 1, slug: slugify(s.name), groups, first, total: s.photos.length };
  });
}

/** A little sketch of the route, for the map cards that fill gaps in the photo walls. */
export function routeSketch(stops: { lat: number; lng: number }[]) {
  const fit = (v: number, all: number[], size: number, flip = false) => {
    const lo = Math.min(...all), span = Math.max(...all) - lo;
    if (!span) return size / 2;
    const t = (v - lo) / span;
    return (flip ? 1 - t : t) * size;
  };
  const lngs = stops.map((s) => s.lng), lats = stops.map((s) => s.lat);
  return stops.map((s) => [20 + fit(s.lng, lngs, 160), 20 + fit(s.lat, lats, 70, true)]);
}
