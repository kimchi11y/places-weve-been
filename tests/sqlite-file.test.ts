import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteTripStore } from '../src/server/stores/sqlite';
import { openSqliteFile } from '../src/server/stores/sqlite-file';

const jeju = { title: 'Jeju', startDate: '2025-04-03', endDate: '2025-04-08', countries: ['KR'], summary: 'Islands.' };
const stop = (name: string) => ({ name, code: 'SGP', lat: 33.25, lng: 126.56, date: '2025-04-07', story: 'Waterfalls.' });

let dir: string, url: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'atlas-db-'));
  url = `file:${path.join(dir, 'deep/er/atlas.db')}`;
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('a SQLite file', () => {
  it('keeps everything when it’s opened again', async () => {
    const trip = await createSqliteTripStore(await openSqliteFile(url)).createTrip(jeju);
    expect(await createSqliteTripStore(await openSqliteFile(url)).getTrip(trip.id)).toEqual(trip);
  });

  it('keeps foreign keys on, whatever has run before', async () => {
    const db = await openSqliteFile(url);
    const store = createSqliteTripStore(db);
    const trip = await store.createTrip(jeju);
    const orphan = () => db.run(sql`insert into stops (id, trip_id, position, name, code, lat, lng, date, story) values (${crypto.randomUUID()}, 'no-such-trip', 0, 'x', 'x', 0, 0, 'x', 'x')`);
    await store.saveTrip(trip.id, { ...jeju, draft: true, stops: [stop('A')] });
    // at the same time, so the client opens more than one connection
    const results = await Promise.allSettled(Array.from({ length: 12 }, orphan));
    expect(results.filter((r) => r.status === 'fulfilled')).toEqual([]);
  });

  it('undoes a whole save when part of it fails', async () => {
    const db = await openSqliteFile(url);
    const store = createSqliteTripStore(db);
    const trip = await store.createTrip(jeju);
    const { trip: saved } = await store.saveTrip(trip.id, { ...jeju, draft: true, stops: [stop('A')] });
    await db.run(sql`create trigger no_b before insert on stops when new.name = 'B' begin select raise(abort, 'no'); end`);
    await expect(store.saveTrip(trip.id, { ...jeju, title: 'Changed', draft: true, stops: [stop('B')] })).rejects.toThrow();
    expect(await store.getTrip(trip.id)).toEqual(saved);
  });

  it('copes with people reading while someone saves', async () => {
    const store = createSqliteTripStore(await openSqliteFile(url));
    const trip = await store.createTrip(jeju);
    const work = Array.from({ length: 30 }, (_, i) => (i % 3 ? store.getTrips({ drafts: true }) : store.saveTrip(trip.id, { ...jeju, draft: true, stops: [stop(`S${i}`)] })));
    expect((await Promise.allSettled(work)).filter((r) => r.status === 'rejected')).toEqual([]);
  });
});
