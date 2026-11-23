import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { stops } from '../src/schema/tables';
import { ValidationError, type TripInput, type TripRecord } from '../src/schema/trip';
import { createSqliteTripStore } from '../src/server/stores/sqlite';
import { openSqliteFile, sqliteFileTripStore } from '../src/server/stores/sqlite-file';
import type { TripStore } from '../src/server/stores/trip-store';

const jeju = { title: 'Jeju Island', startDate: '2025-04-03', endDate: '2025-04-08', countries: ['kr'], summary: 'Slow island days.' };
const stop = (name: string, extra: Partial<NonNullable<TripInput['stops']>[number]> = {}) => ({
  name, code: 'cju', lat: 33.5, lng: 126.53, date: '2025-04-03', story: 'Black pork barbecue.', ...extra,
});
/** The trip as the editor would send it back, with the given stops. */
const edit = (trip: TripRecord, stops: TripInput['stops'], extra: Partial<TripInput> = {}): TripInput => ({
  title: trip.title, startDate: trip.startDate, endDate: trip.endDate, countries: trip.countries,
  summary: trip.summary, draft: trip.draft, stops, ...extra,
});
const photo = (id: string, fileName: string, takenAt: string | null = null) => ({ id, fileName, takenAt, width: 2000, height: 1500 });

async function errorsOf(promise: Promise<unknown>) {
  const error = await promise.then(() => undefined, (e) => e);
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).errors;
}

let store: TripStore;
beforeEach(async () => {
  store = await sqliteFileTripStore(':memory:');
});

describe('trips', () => {
  it('starts a trip as a draft, with an id from its title and year', async () => {
    const trip = await store.createTrip(jeju);
    expect(trip).toMatchObject({ id: 'jeju-island-2025', draft: true, countries: ['KR'], stops: [] });
    expect(await store.listTrips()).toEqual([]);
    expect(await store.listTrips({ drafts: true })).toHaveLength(1);
  });

  it('takes names in any script', async () => {
    const tokyo = await store.createTrip({ ...jeju, title: '東京' });
    expect([tokyo.id, (await store.createTrip({ ...jeju, title: '大阪' })).id]).toEqual(['東京-2025', '大阪-2025']);
    const { trip } = await store.saveTrip(tokyo.id, edit(tokyo, [stop('浅草'), stop('渋谷')]));
    expect(trip.stops.map((s) => s.name)).toEqual(['浅草', '渋谷']);
    expect(await errorsOf(store.saveTrip(tokyo.id, edit(tokyo, [stop('🏝️')])))).toEqual(['Stop 1 needs a name.']);
  });

  it('explains what is wrong in plain words', async () => {
    const errors = await errorsOf(store.createTrip({ ...jeju, title: ' ', endDate: '2025-04-01', countries: ['XX'] }));
    expect(errors).toEqual(['The trip needs a title.', 'Unknown country code XX.', 'The trip ends before it starts.']);
    expect(await errorsOf(store.createTrip({ ...jeju, endDate: '2025-04-01' }))).toEqual(['The trip ends before it starts.']);
    await store.createTrip(jeju);
    expect(await errorsOf(store.createTrip(jeju))).toEqual(["There's already a trip called jeju-island-2025."]);
  });

  it('saves stops in order and tidies what was typed', async () => {
    const trip = await store.createTrip(jeju);
    const { trip: saved } = await store.saveTrip(trip.id, edit(trip, [
      stop('Jeju City', { story: '  Tangerines! ' }),
      stop('Seogwipo', { code: 'SGP', date: '2025-04-07' }),
    ], { vlog: '' }));
    expect(saved.stops.map((s) => [s.position, s.name, s.code, s.story])).toEqual([
      [0, 'Jeju City', 'CJU', 'Tangerines!'],
      [1, 'Seogwipo', 'SGP', 'Black pork barbecue.'],
    ]);
    expect(saved.vlog).toBeNull();
  });

  it('leaves old handwritten notes as they were', async () => {
    const db = await openSqliteFile(':memory:');
    store = createSqliteTripStore(db);
    const trip = await store.createTrip(jeju);
    const { trip: saved } = await store.saveTrip(trip.id, edit(trip, [stop('Jeju City')]));
    const id = saved.stops[0].id;
    await db.update(stops).set({ notes: ['Tangerines!'] }).where(eq(stops.id, id));
    const { trip: again } = await store.saveTrip(trip.id, edit(trip, [{ ...stop('Jeju-si'), id }, stop('Seogwipo')]));
    expect(again.stops.map((s) => [s.name, s.notes])).toEqual([['Jeju-si', ['Tangerines!']], ['Seogwipo', []]]);
  });

  it('rejects stops with the same name', async () => {
    const trip = await store.createTrip(jeju);
    expect(await errorsOf(store.saveTrip(trip.id, edit(trip, [stop('Jeju City'), stop('jeju city')])))).toEqual([
      'Two stops are called "jeju city".',
    ]);
  });

  it('rejects the same stop sent twice, instead of losing one', async () => {
    const trip = await store.createTrip(jeju);
    const { trip: saved } = await store.saveTrip(trip.id, edit(trip, [stop('Jeju City')]));
    const id = saved.stops[0].id;
    expect(await errorsOf(store.saveTrip(trip.id, edit(trip, [{ ...stop('Jeju City'), id }, { ...stop('Seogwipo'), id }])))).toEqual([
      'Seogwipo: this stop is in the trip twice. Reload and try again.',
    ]);
    expect((await store.getTrip(trip.id))!.stops.map((s) => s.name)).toEqual(['Jeju City']);
  });

  it('only publishes trips whose stops all have photos', async () => {
    const trip = await store.createTrip(jeju);
    expect(await errorsOf(store.saveTrip(trip.id, edit(trip, [], { draft: false })))).toEqual([
      'Add at least one stop before publishing, or keep it as a draft.',
    ]);
    const { trip: withStop } = await store.saveTrip(trip.id, edit(trip, [stop('Jeju City')]));
    const city = withStop.stops[0];
    expect(await errorsOf(store.saveTrip(trip.id, edit(withStop, [{ ...stop('Jeju City'), id: city.id }], { draft: false })))).toEqual([
      'Jeju City has no photos yet. Add some, or keep the trip as a draft.',
    ]);
    await store.addPhoto(trip.id, city.id, photo('p1', 'a.jpg'));
    const { trip: published } = await store.saveTrip(trip.id, edit(withStop, [{ ...stop('Jeju City'), id: city.id }], { draft: false }));
    expect(published.draft).toBe(false);
    expect(await store.listTrips()).toEqual([{ id: trip.id, title: 'Jeju Island', startDate: '2025-04-03', draft: false }]);
  });
});

describe('photos', () => {
  async function tripWithPhotos() {
    const trip = await store.createTrip(jeju);
    const { trip: saved } = await store.saveTrip(trip.id, edit(trip, [stop('Jeju City'), stop('Seogwipo')]));
    const [city, seogwipo] = saved.stops;
    await store.addPhoto(trip.id, city.id, photo('undated', 'IMG_2.jpg'));
    await store.addPhoto(trip.id, city.id, photo('later', 'IMG_9.jpg', '2025-04-03 18:00:00'));
    await store.addPhoto(trip.id, city.id, photo('earlier', 'IMG_10.jpg', '2025-04-03 09:00:00'));
    await store.addPhoto(trip.id, seogwipo.id, photo('falls', 'IMG_1.jpg'));
    return (await store.getTrip(trip.id))!;
  }

  it('lists them in the order they were taken, undated ones last', async () => {
    const trip = await tripWithPhotos();
    expect(trip.stops[0].photos.map((p) => p.id)).toEqual(['earlier', 'later', 'undated']);
  });

  it('keeps photos when a stop is renamed, and remembers postcard picks', async () => {
    const trip = await tripWithPhotos();
    const [city, seogwipo] = trip.stops;
    const { trip: saved } = await store.saveTrip(trip.id, edit(trip, [
      { ...stop('Jeju-si'), id: city.id, postcard: ['undated', 'earlier'] },
      { ...stop('Seogwipo'), id: seogwipo.id },
    ], { coverPhotoId: 'falls' }));
    expect(saved.stops[0].name).toBe('Jeju-si');
    expect(saved.stops[0].photos.map((p) => [p.id, p.postcard])).toEqual([['earlier', 1], ['later', null], ['undated', 0]]);
    expect(saved.coverPhotoId).toBe('falls');
  });

  it("won't use another stop's photo on a postcard", async () => {
    const trip = await tripWithPhotos();
    const [city, seogwipo] = trip.stops;
    const errors = await errorsOf(store.saveTrip(trip.id, edit(trip, [
      { ...stop('Jeju City'), id: city.id, postcard: ['falls'] },
      { ...stop('Seogwipo'), id: seogwipo.id },
    ])));
    expect(errors).toEqual(["Jeju City: a postcard photo isn't in this stop any more."]);
  });

  it('removing a stop removes its photos and says which, so their files can go too', async () => {
    const trip = await tripWithPhotos();
    const { trip: saved, removedPhotoIds } = await store.saveTrip(trip.id, edit(trip, [{ ...stop('Seogwipo'), id: trip.stops[1].id }]));
    expect(saved.stops.map((s) => s.name)).toEqual(['Seogwipo']);
    expect(removedPhotoIds.sort()).toEqual(['earlier', 'later', 'undated']);
  });

  it('a removed cover photo stops being the cover', async () => {
    const trip = await tripWithPhotos();
    await store.saveTrip(trip.id, edit(trip, trip.stops.map((s) => ({ ...stop(s.name), id: s.id })), { coverPhotoId: 'falls' }));
    await store.removePhoto('falls');
    expect((await store.getTrip(trip.id))!.coverPhotoId).toBeNull();
  });

  it('loads whole trips at once, published ones unless drafts are asked for', async () => {
    const trip = await tripWithPhotos();
    await store.saveTrip(trip.id, edit(trip, trip.stops.map((s) => ({ ...stop(s.name), id: s.id })), { draft: false }));
    await store.createTrip({ ...jeju, title: 'Seoul', startDate: '2023-05-01', endDate: '2023-05-05' });
    expect((await store.getTrips()).map((t) => [t.id, t.stops.map((s) => s.photos.length)])).toEqual([['jeju-island-2025', [3, 1]]]);
    expect((await store.getTrips({ drafts: true })).map((t) => t.id)).toEqual(['jeju-island-2025', 'seoul-2023']);
  });

  it('reorders stops without touching their photos', async () => {
    const trip = await tripWithPhotos();
    const { trip: saved, removedPhotoIds } = await store.saveTrip(trip.id, edit(trip, [...trip.stops].reverse().map((s) => ({ ...stop(s.name), id: s.id }))));
    expect(saved.stops.map((s) => [s.name, s.photos.length])).toEqual([['Seogwipo', 1], ['Jeju City', 3]]);
    expect(removedPhotoIds).toEqual([]);
  });

  it('changes nothing when a save is refused', async () => {
    const trip = await tripWithPhotos();
    expect(await errorsOf(store.saveTrip(trip.id, edit(trip, [{ ...stop('New name'), id: 'deleted-elsewhere' }], { title: 'Changed' })))).toEqual([
      'New name: this stop was deleted elsewhere. Reload and try again.',
    ]);
    expect(await errorsOf(store.saveTrip(trip.id, edit(trip, [], { coverPhotoId: 'falls' })))).toEqual(["The cover photo isn't in this trip any more."]);
    expect(await store.getTrip(trip.id)).toEqual(trip);
  });

  it('deleting a trip returns all its photo ids', async () => {
    const trip = await tripWithPhotos();
    expect((await store.deleteTrip(trip.id)).sort()).toEqual(['earlier', 'falls', 'later', 'undated']);
    expect(await store.getTrip(trip.id)).toBeUndefined();
  });
});
