/**
 * Where photo files are kept: R2 on Cloudflare and in `npm run dev` (r2.ts), a folder on
 * disk for Docker (local-folder.ts). Only resized copies with their GPS removed are ever
 * stored; the database knows which photos exist (tables.ts → photos).
 */

/** Every photo is stored in these widths, as WebP (or JPEG from browsers that can't make WebP). */
export const PHOTO_SIZES = {
  /** postcard thumbnails on the globe */
  thumb: 240,
  /** the photo wall */
  tile: 800,
  /** the globe postcard, the trip page header on phones */
  card: 1400,
  /** the photo viewer and the trip page header */
  full: 2000,
} as const;
export type PhotoSize = keyof typeof PHOTO_SIZES;

export const photoKey = (photoId: string, size: PhotoSize) => `photos/${photoId}/${size}`;
/** Where the site serves it: src/pages/photos/[...key].ts */
export const photoUrl = (photoId: string, size: PhotoSize) => `/${photoKey(photoId, size)}`;

export interface StoredFile {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

export interface PhotoStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** null when there's no such file */
  get(key: string): Promise<StoredFile | null>;
  /** Missing files are skipped. */
  delete(keys: string[]): Promise<void>;
}

/** Deletes every size of these photos, e.g. the ids TripStore.saveTrip says it removed. */
export const deletePhotoFiles = (store: PhotoStore, photoIds: string[]) =>
  store.delete(photoIds.flatMap((id) => (Object.keys(PHOTO_SIZES) as PhotoSize[]).map((size) => photoKey(id, size))));

/** Keys come from URLs, so only plain relative paths may reach the storage. */
export function safeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_.-]*)*$/i.test(key) || key.includes('..')) {
    throw new Error(`Not a valid photo key: ${key}`);
  }
  return key;
}
