/**
 * `npm run seed`: loads the example trips in seed/trips/ into the local database and photo
 * store that `npm run dev` uses (kept in .wrangler/). Running it again replaces them.
 *
 * Each example is a folder: index.md (the trip, as YAML frontmatter + the long story) and
 * photos/<stop-name>/ with that stop's photos.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { getPlatformProxy } from 'wrangler';
import { parse } from 'yaml';
import { slugify } from '../src/lib/slug';
import type { TripInput } from '../src/schema/trip';
import { deletePhotoFiles, photoKey, PHOTO_SIZES, type PhotoSize, type PhotoStore } from '../src/server/photos/photo-store';
import { r2PhotoStore } from '../src/server/photos/r2';
import { d1TripStore } from '../src/server/stores/d1';
import { newId } from '../src/server/ids';
import type { TripStore } from '../src/server/stores/trip-store';

const SEED = path.resolve('seed/trips');
const PHOTO = /\.(jpe?g|png|webp|avif)$/i;
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

/** Resizes a photo into every size, upright and without its location, and stores them. */
async function storePhoto(photos: PhotoStore, file: string) {
  const bytes = await readFile(file);
  const tags = await exifr.parse(bytes, { pick: ['DateTimeOriginal', 'CreateDate'], reviveValues: false }).catch(() => undefined);
  const raw = tags?.DateTimeOriginal ?? tags?.CreateDate;
  const takenAt = typeof raw === 'string' ? raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : null;

  const id = newId();
  let size = { width: 0, height: 0 };
  for (const [name, width] of Object.entries(PHOTO_SIZES) as [PhotoSize, number][]) {
    // sharp leaves out all metadata, GPS included, unless asked to keep it.
    const { data, info } = await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    if (await exifr.gps(data).catch(() => undefined)) throw new Error(`${file} still has its location after resizing`);
    await photos.put(photoKey(id, name), data, 'image/webp');
    if (name === 'full') size = { width: info.width, height: info.height };
  }
  return { id, fileName: path.basename(file), takenAt, ...size };
}

async function seedTrip(trips: TripStore, photos: PhotoStore, folder: string) {
  const text = await readFile(path.join(SEED, folder, 'index.md'), 'utf8');
  const [, yaml, body] = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)!;
  const d = parse(yaml);
  const details = { title: d.title, startDate: day(d.startDate), endDate: day(d.endDate), countries: d.countries, summary: d.summary };

  const existing = (await trips.listTrips({ drafts: true })).find((t) => t.title === d.title && t.startDate === details.startDate);
  if (existing) await deletePhotoFiles(photos, await trips.deleteTrip(existing.id));

  const created = await trips.createTrip(details);
  const stops = (d.stops ?? []).map((s: Record<string, any>) => ({
    name: s.name, code: s.code, lat: s.lat, lng: s.lng, date: day(s.date), story: s.story, notes: s.notes ?? [],
  }));
  const draft = { ...details, story: body.trim(), vlog: d.vlog ?? '', draft: true, stops } satisfies TripInput;
  const { trip } = await trips.saveTrip(created.id, draft);

  // index.md points at photos as "./photos/<folder>/<file>"; the database knows them by id.
  const ids = new Map<string, string>();
  for (const stop of trip.stops) {
    const dir = path.join(SEED, folder, 'photos', slugify(stop.name));
    const files = (await readdir(dir).catch(() => [])).filter((f) => PHOTO.test(f));
    for (const file of files) {
      const photo = await storePhoto(photos, path.join(dir, file));
      await trips.addPhoto(trip.id, stop.id, photo);
      ids.set(`./photos/${slugify(stop.name)}/${file}`, photo.id);
    }
  }

  const final = await trips.saveTrip(trip.id, {
    ...draft,
    draft: d.draft === true,
    coverPhotoId: ids.get(d.cover) ?? null,
    stops: stops.map((s: (typeof stops)[number], i: number) => ({
      ...s,
      id: trip.stops[i].id,
      postcard: (d.stops[i].photos ?? []).map((ref: string) => ids.get(ref)).filter(Boolean),
    })),
  });
  console.log(`  ${final.trip.title}: ${final.trip.stops.length} stops, ${ids.size} photos${final.trip.draft ? ' (draft)' : ''}`);
}

const { env, dispose } = await getPlatformProxy<{ DB: any; PHOTOS: any }>();
try {
  const trips = d1TripStore(env.DB);
  const photos = r2PhotoStore(env.PHOTOS);
  console.log('Loading the example trips:');
  for (const folder of (await readdir(SEED)).sort()) {
    if (!folder.startsWith('.')) await seedTrip(trips, photos, folder);
  }
} finally {
  await dispose();
}
