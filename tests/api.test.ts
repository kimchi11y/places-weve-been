import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localFolderPhotoStore } from '../src/server/photos/local-folder';
import { PHOTO_SIZES, photoKey, type PhotoStore } from '../src/server/photos/photo-store';
import { sqliteFileTripStore } from '../src/server/stores/sqlite-file';
import type { TripStore } from '../src/server/stores/trip-store';

const site = vi.hoisted(() => ({}) as { trips: TripStore; photos: PhotoStore });
vi.mock('../src/server/runtime', () => ({ tripStore: () => site.trips, photoStore: () => site.photos }));
import { DELETE as deletePhoto } from '../src/pages/admin/api/photos/[id]';
import { DELETE as deleteTrip, GET as getTrip, PUT as putTrip } from '../src/pages/admin/api/trips/[id]';
import { POST as postPhoto } from '../src/pages/admin/api/trips/[id]/photos';
import { GET as listTrips, POST as postTrip } from '../src/pages/admin/api/trips/index';
import { GET as servePhoto } from '../src/pages/photos/[...key]';

const jeju = { title: 'Jeju', startDate: '2025-04-03', endDate: '2025-04-08', countries: ['KR'], summary: 'Islands.' };
const stop = { name: 'Seogwipo', code: 'SGP', lat: 33.25, lng: 126.56, date: '2025-04-07', story: 'Waterfalls.' };
const SIZES = Object.keys(PHOTO_SIZES);
const image = () => sharp({ create: { width: 8, height: 6, channels: 3, background: '#2340d0' } });
const webp = async () => new Uint8Array(await image().webp().toBuffer());

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'atlas-api-'));
  site.trips = await sqliteFileTripStore(':memory:');
  site.photos = localFolderPhotoStore(root);
});
afterEach(() => {
  vi.restoreAllMocks();
  return rm(root, { recursive: true, force: true });
});

type Route = (context: never) => unknown;
async function call(handler: Route, params: Record<string, string> = {}, body?: BodyInit) {
  const request = new Request('https://atlas.example/', body === undefined ? {} : { method: 'POST', body });
  const response = (await handler({ params, request } as never)) as Response;
  return { status: response.status, data: await response.json() };
}
async function tripWithStop() {
  const trip = await site.trips.createTrip(jeju);
  const { trip: saved } = await site.trips.saveTrip(trip.id, { ...jeju, draft: true, stops: [stop] });
  return { id: trip.id, stopId: saved.stops[0].id };
}

const META = { fileName: 'a.jpg', takenAt: null, width: 2000, height: 1500 };
async function upload(id: string, stopId: string, { meta = JSON.stringify(META), files = {} }: { meta?: string | null; files?: Record<string, Uint8Array | null> } = {}) {
  const form = new FormData();
  form.set('stop', stopId);
  if (meta !== null) form.set('meta', meta);
  const plain = await webp();
  for (const size of SIZES) {
    const bytes = size in files ? files[size] : plain;
    if (bytes) form.set(size, new Blob([bytes as Uint8Array<ArrayBuffer>]), size);
  }
  return call(postPhoto, { id }, form);
}

describe('trip routes', () => {
  it('creates, lists, loads, saves and deletes a trip', async () => {
    expect(await call(postTrip, {}, JSON.stringify(jeju))).toMatchObject({ status: 201, data: { id: 'jeju-2025' } });
    expect((await call(listTrips)).data).toHaveLength(1); // drafts too
    const saved = await call(putTrip, { id: 'jeju-2025' }, JSON.stringify({ ...jeju, draft: true, stops: [stop] }));
    expect(saved.data.stops[0].name).toBe('Seogwipo');
    expect((await call(getTrip, { id: 'jeju-2025' })).data.stops).toHaveLength(1);
    expect(await call(deleteTrip, { id: 'jeju-2025' })).toEqual({ status: 200, data: { ok: true } });
    expect((await call(listTrips)).data).toEqual([]);
  });

  it('explains bad input', async () => {
    expect(await call(postTrip, {}, '{oops')).toEqual({ status: 400, data: { error: 'That request wasn’t valid JSON.', errors: ['That request wasn’t valid JSON.'] } });
    expect(await call(postTrip, {}, JSON.stringify({ ...jeju, title: '' }))).toMatchObject({ status: 400, data: { errors: ['The trip needs a title.'] } });
  });

  it('says when there is no such trip', async () => {
    expect((await call(getTrip, { id: 'nope' })).status).toBe(404);
    expect((await call(putTrip, { id: 'nope' }, JSON.stringify({ ...jeju, draft: true, stops: [] }))).status).toBe(404);
    expect((await call(deleteTrip, { id: 'nope' })).status).toBe(404);
  });

  it('keeps unexpected errors to itself', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(site.trips, 'getTrip').mockRejectedValue(new Error('D1_ERROR: secret table'));
    const { status, data } = await call(getTrip, { id: 'x' });
    expect(status).toBe(500);
    expect(JSON.stringify(data)).not.toContain('secret');
  });

  it('still answers with the saved trip when old files can’t be deleted', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { id, stopId } = await tripWithStop();
    await upload(id, stopId);
    vi.spyOn(site.photos, 'delete').mockRejectedValue(new Error('R2 is down'));
    expect(await call(putTrip, { id }, JSON.stringify({ ...jeju, draft: true, stops: [] }))).toMatchObject({ status: 200, data: { stops: [] } });
    expect((await call(deleteTrip, { id })).status).toBe(200);
    expect(log).toHaveBeenCalled();
  });

  it('deletes a removed stop’s photo files', async () => {
    const { id, stopId } = await tripWithStop();
    const { data: photo } = await upload(id, stopId);
    await call(putTrip, { id }, JSON.stringify({ ...jeju, draft: true, stops: [] }));
    expect(await site.photos.get(photoKey(photo.id, 'full'))).toBeNull();
  });
});

describe('adding photos', () => {
  it('stores every size', async () => {
    const { id, stopId } = await tripWithStop();
    const { status, data } = await upload(id, stopId);
    expect(status).toBe(201);
    for (const size of SIZES) expect(await site.photos.get(photoKey(data.id, size as 'full'))).toMatchObject({ contentType: 'image/webp' });
    expect((await site.trips.getTrip(id))!.stops[0].photos).toHaveLength(1);
    await call(deletePhoto, { id: data.id });
    expect(await site.photos.get(photoKey(data.id, 'full'))).toBeNull();
    expect((await site.trips.getTrip(id))!.stops[0].photos).toEqual([]);
  });

  it('refuses missing or odd details', async () => {
    const { id, stopId } = await tripWithStop();
    for (const meta of [null, '{oops', JSON.stringify({ ...META, width: 0 }), JSON.stringify({ ...META, takenAt: 'yesterday' })]) {
      expect((await upload(id, stopId, { meta })).status).toBe(400);
    }
  });

  it('refuses missing sizes, fakes, and photos that say where they were taken', async () => {
    const put = vi.spyOn(site.photos, 'put');
    const { id, stopId } = await tripWithStop();
    const gps = new Uint8Array(await image().withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 33/1 0/1' } }).jpeg().toBuffer());
    expect((await upload(id, stopId, { files: { tile: null } })).data.error).toContain('tile size is missing');
    expect((await upload(id, stopId, { files: { card: new TextEncoder().encode('<script>alert(1)</script>') } })).data.error).toContain("isn't a JPEG or WebP");
    expect((await upload(id, stopId, { files: { full: gps } })).data.error).toContain('hidden details');
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses files over 20 MB', async () => {
    const { id, stopId } = await tripWithStop();
    const limit = 20 * 1024 * 1024;
    expect((await upload(id, stopId, { files: { full: new Uint8Array(limit + 1) } })).data.error).toContain('too big');
    expect((await upload(id, stopId, { files: { full: new Uint8Array(limit) } })).data.error).not.toContain('too big');
  });

  it('leaves no files behind when storing one size fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { id, stopId } = await tripWithStop();
    const { put } = site.photos;
    const keys: string[] = [];
    vi.spyOn(site.photos, 'put').mockImplementation(async (key, bytes, type) => {
      keys.push(key);
      if (key.endsWith('/thumb')) throw new Error('R2 is down');
      await new Promise((done) => setTimeout(done, 20)); // the others finish after the failure
      await put(key, bytes, type);
    });
    expect((await upload(id, stopId)).status).toBe(500);
    await new Promise((done) => setTimeout(done, 60));
    expect(keys).toHaveLength(SIZES.length);
    for (const key of keys) expect(await site.photos.get(key)).toBeNull();
    expect((await site.trips.getTrip(id))!.stops[0].photos).toEqual([]);
  });

  it('leaves no files behind when the stop is gone', async () => {
    const { id } = await tripWithStop();
    const put = vi.spyOn(site.photos, 'put');
    expect((await upload(id, 'no-such-stop')).status).toBe(404);
    expect(put).toHaveBeenCalledTimes(SIZES.length);
    for (const [key] of put.mock.calls) expect(await site.photos.get(key)).toBeNull();
  });
});

describe('serving photos', () => {
  const serve = async (key: string) => (await servePhoto({ params: { key } } as never)) as Response;

  it('serves a photo, cached privately', async () => {
    await site.photos.put(photoKey('p1', 'thumb'), await webp(), 'image/webp');
    const response = await serve('p1/thumb');
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toContain('private');
    expect((await response.arrayBuffer()).byteLength).toBe(Number(response.headers.get('content-length')));
  });

  it('answers 404 for missing photos and invalid keys', async () => {
    for (const key of ['p1/thumb', '../../etc/passwd', 'p1//full', '']) expect((await serve(key)).status).toBe(404);
  });
});
