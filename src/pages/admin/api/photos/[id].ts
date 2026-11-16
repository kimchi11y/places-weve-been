import { deletePhotoFiles } from '../../../../server/photos/photo-store';
import { json, route } from '../../../../server/http';
import { photoStore, tripStore } from '../../../../server/runtime';

export const DELETE = route(async ({ params }) => {
  await tripStore().removePhoto(params.id!);
  await deletePhotoFiles(photoStore(), [params.id!]);
  return json({ ok: true });
});
