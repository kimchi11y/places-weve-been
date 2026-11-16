/**
 * The last check before a photo is stored: it must be a plain JPEG or WebP image with no
 * EXIF or XMP metadata, which is where phones keep the GPS position. The editor already
 * leaves metadata behind when it resizes photos in the browser; this makes sure of it.
 */

export type PhotoType = 'image/jpeg' | 'image/webp';

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));

/** The image type from the file's first bytes, whatever it claims to be. */
export function sniffType(bytes: Uint8Array): PhotoType | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return undefined;
}

/** JPEG keeps EXIF and XMP in APP1 segments (and some cameras' extras in APP2–APP15). */
function jpegHasMetadata(bytes: Uint8Array) {
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return true; // not a well-formed file: don't trust it
    const marker = bytes[i + 1];
    if (marker === 0xda) return false; // start of the image data: no more headers
    if (marker >= 0xe1 && marker <= 0xef) return true;
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return true;
}

/**
 * The same JPEG without those segments. Safari writes a small EXIF and Photoshop segment into
 * every JPEG it makes from a canvas, so the editor removes them before uploading. A file that
 * isn't well-formed comes back unchanged, for the check above to refuse.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xda) {
      kept.push(bytes.subarray(i));
      const out = new Uint8Array(kept.reduce((n, part) => n + part.length, 0));
      kept.reduce((at, part) => (out.set(part, at), at + part.length), 0);
      return out;
    }
    const end = i + 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    if (marker < 0xe1 || marker > 0xef) kept.push(bytes.subarray(i, end));
    i = end;
  }
  return bytes.slice();
}

/** WebP keeps them in "EXIF" and "XMP " chunks. */
function webpHasMetadata(bytes: Uint8Array) {
  let i = 12;
  while (i + 8 <= bytes.length) {
    const chunk = ascii(bytes, i, 4);
    if (chunk === 'EXIF' || chunk === 'XMP ') return true;
    const size = bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24);
    i += 8 + size + (size % 2);
  }
  return i !== bytes.length;
}

export function hasMetadata(bytes: Uint8Array) {
  const type = sniffType(bytes);
  if (type === 'image/jpeg') return jpegHasMetadata(bytes);
  if (type === 'image/webp') return webpHasMetadata(bytes);
  return true;
}
