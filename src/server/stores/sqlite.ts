/**
 * The TripStore for any SQLite database Drizzle can talk to. d1.ts and sqlite-file.ts only
 * open the connection and hand it here. Writes go through `batch`, which both D1 and libSQL
 * run as one transaction, so a save either fully happens or not at all.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { slugify } from '../../lib/slug';
import { newId } from '../ids';
import * as schema from '../../schema/tables';
import { photos, stops, trips } from '../../schema/tables';
import {
  newTripInput,
  parseOrThrow,
  tripInput,
  ValidationError,
  type PhotoRow,
  type TripRecord,
  type TripRow,
} from '../../schema/trip';
import { NotFoundError, type TripStore } from './trip-store';

export type AtlasDb = BaseSQLiteDatabase<'async', any, typeof schema> & Pick<LibSQLDatabase<typeof schema>, 'batch'>;
type Query = Parameters<AtlasDb['batch']>[0][number];

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/** The order they were taken; undated ones (screenshots, WhatsApp copies) go last, by file name. */
function byTaken(a: PhotoRow, b: PhotoRow) {
  const byName = a.fileName.localeCompare(b.fileName, undefined, { numeric: true });
  if (a.takenAt && b.takenAt) return a.takenAt.localeCompare(b.takenAt) || byName;
  return a.takenAt ? -1 : b.takenAt ? 1 : byName;
}

export function createSqliteTripStore(db: AtlasDb): TripStore {
  const run = (queries: Query[]) => (queries.length ? db.batch(queries as [Query, ...Query[]]) : Promise.resolve());

  /** Three queries however many trips there are, instead of a few per trip. */
  async function withStops(rows: TripRow[]): Promise<TripRecord[]> {
    if (!rows.length) return [];
    const ids = rows.map((t) => t.id);
    const allStops = await db.select().from(stops).where(inArray(stops.tripId, ids)).orderBy(stops.position);
    const allPhotos = (await db.select().from(photos).where(inArray(photos.tripId, ids))).sort(byTaken);
    return rows.map((trip) => ({
      ...trip,
      stops: allStops.filter((s) => s.tripId === trip.id).map((s) => ({ ...s, photos: allPhotos.filter((p) => p.stopId === s.id) })),
    }));
  }

  async function getTrip(id: string): Promise<TripRecord | undefined> {
    const [trip] = await withStops(await db.select().from(trips).where(eq(trips.id, id)));
    return trip;
  }

  async function mustGet(id: string) {
    const trip = await getTrip(id);
    if (!trip) throw new NotFoundError(`No trip called ${id}`);
    return trip;
  }

  return {
    getTrip,

    async getTrips({ drafts = false } = {}) {
      return withStops(await db.select().from(trips).where(drafts ? undefined : eq(trips.draft, false)).orderBy(desc(trips.startDate)));
    },

    async listTrips({ drafts = false } = {}) {
      const rows = await db
        .select({ id: trips.id, title: trips.title, startDate: trips.startDate, draft: trips.draft })
        .from(trips)
        .where(drafts ? undefined : eq(trips.draft, false))
        .orderBy(desc(trips.startDate));
      return rows;
    },

    async createTrip(raw) {
      const input = parseOrThrow(newTripInput, raw);
      const id = slugify(`${input.title} ${input.startDate.slice(0, 4)}`);
      if (await getTrip(id)) throw new ValidationError([`There's already a trip called ${id}.`]);
      await db.insert(trips).values({ ...input, id, draft: true });
      return mustGet(id);
    },

    async saveTrip(id, raw) {
      const input = parseOrThrow(tripInput, raw);
      const current = await mustGet(id);
      const known = new Map(current.stops.map((s) => [s.id, s]));
      const errors: string[] = [];
      const sent = new Set<string>();

      const planned = input.stops.map((s, position) => {
        if (s.id && !known.has(s.id)) errors.push(`${s.name}: this stop was deleted elsewhere. Reload and try again.`);
        if (s.id && sent.has(s.id)) errors.push(`${s.name}: this stop is in the trip twice. Reload and try again.`);
        if (s.id) sent.add(s.id);
        const existing = s.id ? known.get(s.id) : undefined;
        const own = new Set(existing?.photos.map((p) => p.id));
        for (const p of s.postcard) if (!own.has(p)) errors.push(`${s.name}: a postcard photo isn't in this stop any more.`);
        if (!input.draft && !own.size) errors.push(`${s.name} has no photos yet. Add some, or keep the trip as a draft.`);
        const { id: _, postcard, ...fields } = s;
        return { id: existing?.id ?? newId(), isNew: !existing, position, fields, postcard };
      });

      const kept = new Set(planned.map((s) => s.id));
      const removed = current.stops.filter((s) => !kept.has(s.id));
      const keptPhotos = new Set(current.stops.filter((s) => kept.has(s.id)).flatMap((s) => s.photos.map((p) => p.id)));
      if (input.coverPhotoId && !keptPhotos.has(input.coverPhotoId)) errors.push("The cover photo isn't in this trip any more.");
      if (errors.length) throw new ValidationError(errors);

      const { stops: _, ...details } = input;
      const queries: Query[] = [db.update(trips).set({ ...details, updatedAt: now() }).where(eq(trips.id, id))];
      if (removed.length) {
        const ids = removed.map((s) => s.id);
        queries.push(db.delete(photos).where(inArray(photos.stopId, ids)), db.delete(stops).where(inArray(stops.id, ids)));
      }
      for (const s of planned) {
        queries.push(
          s.isNew
            ? db.insert(stops).values({ ...s.fields, id: s.id, tripId: id, position: s.position })
            : db.update(stops).set({ ...s.fields, position: s.position, updatedAt: now() }).where(eq(stops.id, s.id)),
        );
      }
      queries.push(db.update(photos).set({ postcard: null }).where(eq(photos.tripId, id)));
      for (const s of planned) {
        s.postcard.forEach((photoId, i) => queries.push(db.update(photos).set({ postcard: i }).where(eq(photos.id, photoId))));
      }
      await run(queries);

      return { trip: await mustGet(id), removedPhotoIds: removed.flatMap((s) => s.photos.map((p) => p.id)) };
    },

    async deleteTrip(id) {
      const trip = await mustGet(id);
      await run([
        db.delete(photos).where(eq(photos.tripId, id)),
        db.delete(stops).where(eq(stops.tripId, id)),
        db.delete(trips).where(eq(trips.id, id)),
      ]);
      return trip.stops.flatMap((s) => s.photos.map((p) => p.id));
    },

    async addPhoto(tripId, stopId, photo) {
      const [stop] = await db.select({ id: stops.id }).from(stops).where(and(eq(stops.id, stopId), eq(stops.tripId, tripId)));
      if (!stop) throw new NotFoundError(`Trip ${tripId} has no such stop`);
      const [row] = await db.insert(photos).values({ ...photo, tripId, stopId }).returning();
      return row;
    },

    async removePhoto(id) {
      await run([
        db.update(trips).set({ coverPhotoId: null }).where(eq(trips.coverPhotoId, id)),
        db.delete(photos).where(eq(photos.id, id)),
      ]);
    },
  };
}
