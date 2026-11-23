/**
 * The database tables: the one place the shape of a trip is defined. Runs on any SQLite
 * (Cloudflare D1, a local file, Turso). After changing it, run `npm run db:generate`
 * to write a migration, and only ever add columns: dropping one deletes every family's data.
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
};

export const trips = sqliteTable('trips', {
  /** also the page URL: /trips/<id>, e.g. "jeju-2025" */
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** "2025-04-03" */
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  /** ISO 3166 two-letter codes, e.g. ["AT", "DE"] */
  countries: text('countries', { mode: 'json' }).$type<string[]>().notNull(),
  summary: text('summary').notNull(),
  /** the long story on the trip page, in Markdown */
  story: text('story').notNull().default(''),
  vlog: text('vlog'),
  /** kept off the site while the trip is still being put together */
  draft: integer('draft', { mode: 'boolean' }).notNull().default(true),
  /** defaults to the first stop's first postcard photo */
  coverPhotoId: text('cover_photo_id'),
  ...timestamps,
});

export const stops = sqliteTable(
  'stops',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    /** order of travel within the trip, from 0 */
    position: integer('position').notNull(),
    name: text('name').notNull(),
    /** short code shown on the stamp, e.g. SZG */
    code: text('code').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    date: text('date').notNull(),
    story: text('story').notNull(),
    /** no longer used: handwritten notes, kept so nobody's are deleted */
    notes: text('notes', { mode: 'json' }).$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index('stops_trip').on(t.tripId, t.position)],
);

/** One row per photo. The image files themselves live in the photo store, under photoKey(id, size). */
export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    stopId: text('stop_id').notNull().references(() => stops.id, { onDelete: 'cascade' }),
    /** the name it was uploaded with; orders photos that have no camera date */
    fileName: text('file_name').notNull(),
    /** "2025-09-18 14:22:01", from the camera; missing for screenshots, WhatsApp copies, etc. */
    takenAt: text('taken_at'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** place on the stop's globe postcard (0, 1, 2); null when it's only on the photo wall */
    postcard: integer('postcard'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('photos_stop').on(t.stopId)],
);
