import type { PhotoRow, StopRow, TripRecord } from '../schema/trip';
import { photoUrl } from '../server/photos/photo-store';
import type { TripStore } from '../server/stores/trip-store';
import { continentOf } from './continents';
import { countryName, numericId } from './countries';
import { dateRange, DAY, daysBetween, fmtDay, fmtMonth, fmtShort, parseDay } from './format';
import { inkFor } from './ink';
import { slugify } from './slug';
import type { Photo, Stats, Trip } from './types';

type StopWithPhotos = StopRow & { photos: PhotoRow[] };

/** The photos picked for a stop's postcard, or else its first three. */
export function postcardPhotos(stop: StopWithPhotos) {
  const picked = stop.photos.filter((p) => p.postcard !== null).sort((a, b) => a.postcard! - b.postcard!);
  return picked.length ? picked : stop.photos.slice(0, 3);
}

/** The picked cover, or else the first stop's first postcard photo. */
export function coverPhoto(trip: TripRecord): PhotoRow | undefined {
  return trip.stops.flatMap((s) => s.photos).find((p) => p.id === trip.coverPhotoId) ?? postcardPhotos(trip.stops[0])[0];
}

const toPhoto = (p: PhotoRow): Photo => ({ src: photoUrl(p.id, 'card'), tile: photoUrl(p.id, 'tile'), thumb: photoUrl(p.id, 'thumb') });

export function toTrip(t: TripRecord): Trip {
  const start = parseDay(t.startDate);
  return {
    id: t.id,
    title: t.title,
    year: start.getUTCFullYear(),
    dates: dateRange(t.startDate, t.endDate),
    when: fmtMonth.format(start),
    days: daysBetween(t.startDate, t.endDate),
    ...inkFor(t.id),
    countries: t.countries,
    countryIds: t.countries.map(numericId),
    countryNames: t.countries.map(countryName),
    continents: [...new Set(t.countries.map(continentOf))],
    summary: t.summary,
    cover: toPhoto(coverPhoto(t)!),
    photoCount: t.stops.reduce((n, s) => n + s.photos.length, 0),
    vlog: t.vlog ?? undefined,
    stops: t.stops.map((s) => {
      const postcard = postcardPhotos(s);
      const day = parseDay(s.date);
      return {
        name: s.name,
        code: s.code,
        coord: [s.lng, s.lat],
        date: fmtDay.format(day),
        dateShort: fmtShort.format(day),
        dateISO: s.date,
        dayNo: Math.round((+day - +start) / DAY) + 1,
        story: s.story,
        photos: postcard.map(toPhoto),
        slug: slugify(s.name),
        more: s.photos.length - postcard.length,
      };
    }),
  };
}

/**
 * Published trips, newest first. A trip only publishes once every stop has photos, but a
 * photo deleted afterwards could leave one empty, so those wait until it gets photos again.
 */
export async function loadTrips(store: TripStore): Promise<Trip[]> {
  const ready = (await store.getTrips()).filter((t) => t.stops.length && t.stops.every((s) => s.photos.length));
  return ready.map(toTrip);
}

export function tripStats(trips: Trip[]): Stats {
  return {
    trips: trips.length,
    countries: new Set(trips.flatMap((t) => t.countryIds)).size,
    days: trips.reduce((n, t) => n + t.days, 0),
  };
}
