/**
 * Adds a photo to one of the trip's stops. The editor sends it already resized into every
 * size in PHOTO_SIZES, plus the stop's id and what it read from the original (when it was
 * taken, its size).
 */
import { newId } from '../../../../../server/ids';
import { hasMetadata, sniffType } from '../../../../../server/photos/metadata';
import { deletePhotoFiles, PHOTO_SIZES, photoKey, type PhotoSize } from '../../../../../server/photos/photo-store';
import { json, route } from '../../../../../server/http';
import { photoStore, tripStore } from '../../../../../server/runtime';
import { parseOrThrow, photoUpload, ValidationError } from '../../../../../schema/trip';

const MAX_BYTES = 20 * 1024 * 1024;

export const POST = route(async ({ params, request }) => {
  const form = await request.formData();
  const stopId = String(form.get('stop') ?? '');
  let details: unknown;
  try {
    details = JSON.parse(String(form.get('meta')));
  } catch {
    throw new ValidationError(['The photo’s details are missing.']);
  }
  const meta = parseOrThrow(photoUpload, details);

  const files = await Promise.all(
    (Object.keys(PHOTO_SIZES) as PhotoSize[]).map(async (size) => {
      const file = form.get(size);
      if (!(file instanceof File)) throw new ValidationError([`${meta.fileName}: the ${size} size is missing.`]);
      if (file.size > MAX_BYTES) throw new ValidationError([`${meta.fileName} is too big.`]);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = sniffType(bytes);
      if (!type) throw new ValidationError([`${meta.fileName} isn't a JPEG or WebP image.`]);
      if (hasMetadata(bytes)) throw new ValidationError([`${meta.fileName} still has hidden details like its location, so it wasn't saved.`]);
      return { size, bytes, type };
    }),
  );

  const id = newId();
  const photos = photoStore();
  await Promise.all(files.map(({ size, bytes, type }) => photos.put(photoKey(id, size), bytes, type)));
  try {
    return json(await tripStore().addPhoto(params.id!, stopId, { ...meta, id }), 201);
  } catch (error) {
    await deletePhotoFiles(photos, [id]);
    throw error;
  }
});
