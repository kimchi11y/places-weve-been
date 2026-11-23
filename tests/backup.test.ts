import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyPhotos, exportData, importData, photoKeys } from '../src/server/backup';
import { localFolderPhotoStore } from '../src/server/photos/local-folder';
import { stops } from '../src/schema/tables';
import { photoKey } from '../src/server/photos/photo-store';
import { createSqliteTripStore } from '../src/server/stores/sqlite';
import { openSqliteFile } from '../src/server/stores/sqlite-file';

const jeju = { title: 'Jeju', startDate: '2025-04-03', endDate: '2025-04-08', countries: ['KR'], summary: 'Islands.' };
const stop = { name: 'Seogwipo', code: 'SGP', lat: 33.25, lng: 126.56, date: '2025-04-07', story: 'Waterfalls.' };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'atlas-backup-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function filled() {
  const db = await openSqliteFile(':memory:');
  const store = createSqliteTripStore(db);
  const trip = await store.createTrip(jeju);
  const { trip: saved } = await store.saveTrip(trip.id, { ...jeju, draft: true, stops: [stop] });
  await db.update(stops).set({ notes: ['Tangerines!'] });
  await store.addPhoto(trip.id, saved.stops[0].id, { id: 'p1', fileName: 'a.jpg', takenAt: '2025-04-07 09:00:00', width: 2000, height: 1500 });
  await store.saveTrip(trip.id, { ...jeju, draft: false, story: 'The long story.', coverPhotoId: 'p1', stops: [{ ...stop, id: saved.stops[0].id, postcard: ['p1'] }] });
  return { db, store, id: trip.id };
}

describe('database backups', () => {
  it('restores into an empty database exactly as it was', async () => {
    const { db, store, id } = await filled();
    const backup = JSON.parse(JSON.stringify(await exportData(db)));

    const emptyDb = await openSqliteFile(':memory:');
    await importData(emptyDb, backup);
    expect(await createSqliteTripStore(emptyDb).getTrip(id)).toEqual(await store.getTrip(id));
  });

  it('replaces what was there', async () => {
    const { db, id } = await filled();
    const backup = await exportData(db);
    const store = createSqliteTripStore(db);
    await store.createTrip({ ...jeju, title: 'Added later' });
    await store.deleteTrip(id);

    await importData(db, backup);
    expect((await store.listTrips({ drafts: true })).map((t) => t.id)).toEqual([id]);
    expect((await store.getTrip(id))!.stops[0].photos[0].postcard).toBe(0);
  });

  it('changes nothing when a restore fails partway', async () => {
    const { db, id } = await filled();
    const backup = await exportData(db);
    const broken = { ...backup, photos: [{ ...backup.photos[0], stopId: 'no-such-stop' }] };
    await expect(importData(db, broken)).rejects.toThrow();
    expect((await createSqliteTripStore(db).getTrip(id))!.stops[0].photos).toHaveLength(1);
  });

  it('refuses a backup from a newer version', async () => {
    const { db } = await filled();
    await expect(importData(db, { ...(await exportData(db)), version: 2 as 1 })).rejects.toThrow('version 2');
  });
});

describe('photo backups', () => {
  it('copies files with their type, skips what it has, and reports what is gone', async () => {
    const live = localFolderPhotoStore(path.join(dir, 'live'));
    const saved = localFolderPhotoStore(path.join(dir, 'saved'));
    await live.put(photoKey('p1', 'thumb'), new Uint8Array([1, 2, 3]), 'image/webp');
    await live.put(photoKey('p1', 'full'), new Uint8Array([4, 5]), 'image/jpeg');
    const keys = photoKeys(['p1']);

    const { missing, ...counts } = await copyPhotos(live, saved, keys, { skipExisting: true });
    expect(counts).toEqual({ copied: 2, skipped: 0 });
    // files are copied several at a time, so they can finish in any order
    expect(missing.sort()).toEqual([photoKey('p1', 'card'), photoKey('p1', 'tile')]);
    const file = await saved.get(photoKey('p1', 'full'));
    expect(file!.contentType).toBe('image/jpeg');
    expect(new Uint8Array(await new Response(file!.body).arrayBuffer())).toEqual(new Uint8Array([4, 5]));

    await live.put(photoKey('p1', 'tile'), new Uint8Array([6]), 'image/webp');
    expect(await copyPhotos(live, saved, [photoKey('p1', 'thumb'), photoKey('p1', 'tile')], { skipExisting: true })).toEqual({ copied: 1, skipped: 1, missing: [] });
  });
});
