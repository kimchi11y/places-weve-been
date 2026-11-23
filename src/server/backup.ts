/**
 * What `npm run backup` and `npm run restore` do, apart from talking to Cloudflare. A backup
 * is every row of the database as JSON, plus the photo files. Rows are copied as they are, so
 * ids, dates and postcard picks come back exactly; the tables must be up to date first.
 */
import { photos, stops, trips } from '../schema/tables';
import type { PhotoRow, StopRow, TripRow } from '../schema/trip';
import { PHOTO_SIZES, photoKey, type PhotoSize, type PhotoStore } from './photos/photo-store';
import type { AtlasDb } from './stores/sqlite';

export interface BackupData {
  version: 1;
  createdAt: string;
  trips: TripRow[];
  stops: StopRow[];
  photos: PhotoRow[];
}

export async function exportData(db: AtlasDb): Promise<BackupData> {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    trips: await db.select().from(trips),
    stops: await db.select().from(stops),
    photos: await db.select().from(photos),
  };
}

/** Replaces everything in the database, as one batch. Safe to run again if it's interrupted. */
export async function importData(db: AtlasDb, data: BackupData) {
  if (data.version !== 1) throw new Error(`This backup has version ${data.version}, which this copy of the site can't read.`);
  const queries = [
    db.delete(photos),
    db.delete(stops),
    db.delete(trips),
    ...data.trips.map((row) => db.insert(trips).values(row)),
    ...data.stops.map((row) => db.insert(stops).values(row)),
    ...data.photos.map((row) => db.insert(photos).values(row)),
  ];
  await db.batch(queries as unknown as Parameters<AtlasDb['batch']>[0]);
}

/**
 * Copies the listed files and returns the ones `from` doesn't have. With `skipExisting`,
 * files already at the destination are left alone: a photo's files never change once
 * stored, so repeat backups only fetch what's new.
 */
export async function copyPhotos(from: PhotoStore, to: PhotoStore, keys: string[], { skipExisting = false, concurrency = 6, onFile }: { skipExisting?: boolean; concurrency?: number; onFile?: (done: number, total: number) => void } = {}) {
  const result = { copied: 0, skipped: 0, missing: [] as string[] };
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++];
      const existing = skipExisting ? await to.get(key) : null;
      if (existing) {
        await existing.body.cancel();
        result.skipped++;
      } else {
        const file = await from.get(key);
        if (!file) {
          result.missing.push(key);
        } else {
          await to.put(key, new Uint8Array(await new Response(file.body).arrayBuffer()), file.contentType);
          result.copied++;
        }
      }
      onFile?.(++done, keys.length);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result;
}

/** Every stored file of these photos. */
export const photoKeys = (photoIds: string[]) =>
  photoIds.flatMap((id) => (Object.keys(PHOTO_SIZES) as PhotoSize[]).map((size) => photoKey(id, size)));

/** Which of a backup's files are missing from the photos saved next to it. */
export async function missingFiles(saved: PhotoStore, keys: string[]) {
  const missing: string[] = [];
  for (const key of keys) {
    const file = await saved.get(key);
    if (file) await file.body.cancel();
    else missing.push(key);
  }
  return missing;
}

/** Puts a backup in place of everything there now. Say what will be lost, and ask, before calling this. */
export async function replaceAll({ db, photos, saved, backup, concurrency, onFile }: {
  db: AtlasDb;
  photos: PhotoStore;
  /** where the backup's photo files are */
  saved: PhotoStore;
  backup: BackupData;
  concurrency?: number;
  onFile?: (done: number, total: number) => void;
}) {
  const current = await exportData(db);
  // New files first, then the database, then old files: a failure never leaves rows without photos.
  const { copied } = await copyPhotos(saved, photos, photoKeys(backup.photos.map((p) => p.id)), { concurrency, onFile });
  await importData(db, backup);
  const keep = new Set(backup.photos.map((p) => p.id));
  const stale = photoKeys(current.photos.map((p) => p.id).filter((id) => !keep.has(id)));
  await photos.delete(stale);
  return { copied, removed: stale.length };
}
