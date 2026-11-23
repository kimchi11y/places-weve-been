import { deletePhotoFiles } from '../../../../server/photos/photo-store';
import { json, readJson, route } from '../../../../server/http';
import { photoStore, tripStore } from '../../../../server/runtime';
import { NotFoundError } from '../../../../server/stores/trip-store';

/** The trip has already changed by now, so files that can't be deleted are only logged. */
const cleanUp = (photoIds: string[]) =>
  deletePhotoFiles(photoStore(), photoIds).catch((error) => console.error('[editor] photo files left behind', photoIds, error));

export const GET = route(async ({ params }) => {
  const trip = await tripStore().getTrip(params.id!);
  if (!trip) throw new NotFoundError(`No trip called ${params.id}`);
  return json(trip);
});

export const PUT = route(async ({ params, request }) => {
  const { trip, removedPhotoIds } = await tripStore().saveTrip(params.id!, await readJson(request));
  await cleanUp(removedPhotoIds);
  return json(trip);
});

export const DELETE = route(async ({ params }) => {
  await cleanUp(await tripStore().deleteTrip(params.id!));
  return json({ ok: true });
});
