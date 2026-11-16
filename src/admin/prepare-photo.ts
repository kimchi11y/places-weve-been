/**
 * Gets a photo ready to upload, in the browser: turned upright, resized into every size the
 * site uses, and re-drawn, which leaves all of the original's metadata behind, including the
 * GPS position phones record. Only the time it was taken is kept, read here and sent alongside.
 */
import exifr from 'exifr';
import { stripJpegMetadata } from '../server/photos/metadata';
import { PHOTO_SIZES, type PhotoSize } from '../server/photos/photo-store';

export interface PreparedPhoto {
  meta: { fileName: string; takenAt: string | null; width: number; height: number };
  files: Record<PhotoSize, Blob>;
}

const isHeic = (file: File) => /\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/.test(file.type);

/** "2025:09:18 14:22:01" (how cameras write it) → "2025-09-18 14:22:01" */
async function takenAt(file: File) {
  const tags = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'], reviveValues: false }).catch(() => undefined);
  const raw = tags?.DateTimeOriginal ?? tags?.CreateDate;
  return typeof raw === 'string' && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(raw)
    ? raw.slice(0, 19).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    : null;
}

async function decode(file: File) {
  try {
    // Safari reads iPhone HEIC photos itself; createImageBitmap also applies the camera's rotation.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    if (!isHeic(file)) throw new Error(`${file.name} couldn't be read as a photo.`, { cause: error });
    // Other browsers can't, so a HEIC reader (about 3 MB) is loaded only when one is needed.
    const { heicTo } = await import('heic-to');
    return heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
  }
}

async function encode(canvas: HTMLCanvasElement) {
  const blob = (type: string) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.82));
  // Browsers that can't make WebP quietly hand back a PNG instead; JPEG is much smaller.
  const webp = await blob('image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await blob('image/jpeg');
  if (!jpeg) throw new Error('This browser couldn’t resize the photo.');
  return new Blob([stripJpegMetadata(new Uint8Array(await jpeg.arrayBuffer()))], { type: 'image/jpeg' });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const [bitmap, taken] = await Promise.all([decode(file), takenAt(file)]);
  const files = {} as Record<PhotoSize, Blob>;
  let full = { width: 0, height: 0 };
  try {
    for (const [size, maxWidth] of Object.entries(PHOTO_SIZES) as [PhotoSize, number][]) {
      const width = Math.min(maxWidth, bitmap.width);
      const height = Math.round((bitmap.height * width) / bitmap.width);
      const canvas = Object.assign(document.createElement('canvas'), { width, height });
      const context = canvas.getContext('2d')!;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
      files[size] = await encode(canvas);
      if (size === 'full') full = { width, height };
    }
  } finally {
    bitmap.close();
  }
  return { meta: { fileName: file.name, takenAt: taken, ...full }, files };
}
