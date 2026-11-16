import { deletePhotoFiles } from '../../../../server/photos/photo-store';
import { json, readJson, route } from '../../../../server/http';
import { photoStore, tripStore } from '../../../../server/runtime';
import { NotFoundError } from '../../../../server/stores/trip-store';

export const GET = route(async ({ params }) => {
  const trip = await tripStore().getTrip(params.id!);
  if (!trip) throw new NotFoundError(`No trip called ${params.id}`);
  return json(trip);
});

export const PUT = route(async ({ params, request }) => {
  const { trip, removedPhotoIds } = await tripStore().saveTrip(params.id!, await readJson(request));
  await deletePhotoFiles(photoStore(), removedPhotoIds);
  return json(trip);
});

export const DELETE = route(async ({ params }) => {
  await deletePhotoFiles(photoStore(), await tripStore().deleteTrip(params.id!));
  return json({ ok: true });
});
