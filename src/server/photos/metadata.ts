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

interface Segment { marker: number; start: number; end: number }

/**
 * The JPEG's segments, from just after its start marker up to and including its end marker;
 * null when it isn't well-formed. A scan's segment includes the picture data that follows it,
 * and a progressive JPEG has several scans, with room for other segments in between.
 */
function jpegSegments(bytes: Uint8Array): Segment[] | null {
  const segments: Segment[] = [];
  let i = 2;
  while (i + 2 <= bytes.length) {
    const start = i;
    if (bytes[i] !== 0xff) return null;
    while (bytes[i + 1] === 0xff) i++; // padding before a marker
    const marker = bytes[i + 1];
    if (marker === 0xd9) {
      segments.push({ marker, start, end: i + 2 });
      return segments;
    }
    if (i + 4 > bytes.length) return null;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return null;
    i += 2 + length;
    if (marker === 0xda) {
      // Picture data runs to the next real marker: FF00 is a plain FF, FFD0–FFD7 are restarts
      while (i + 1 < bytes.length && !(bytes[i] === 0xff && bytes[i + 1] !== 0 && !(bytes[i + 1] >= 0xd0 && bytes[i + 1] <= 0xd7))) i++;
    }
    segments.push({ marker, start, end: i });
  }
  return null;
}

/** JPEG keeps EXIF and XMP in APP1 segments, some cameras' extras in APP2–APP15, and comments in COM. */
const isMetadata = ({ marker }: Segment) => (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;

function jpegHasMetadata(bytes: Uint8Array) {
  const segments = jpegSegments(bytes);
  if (!segments) return true; // not a well-formed file: don't trust it
  return segments.some(isMetadata) || segments.at(-1)!.end !== bytes.length;
}

/**
 * The same JPEG without those segments, or anything after its end. Safari writes a small EXIF
 * and Photoshop segment into every JPEG it makes from a canvas, so the editor removes them
 * before uploading. A file that isn't well-formed comes back unchanged, for the check above to refuse.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const segments = jpegSegments(bytes);
  if (!segments) return bytes.slice();
  const kept = [bytes.subarray(0, 2), ...segments.filter((s) => !isMetadata(s)).map((s) => bytes.subarray(s.start, s.end))];
  const out = new Uint8Array(kept.reduce((n, part) => n + part.length, 0));
  kept.reduce((at, part) => (out.set(part, at), at + part.length), 0);
  return out;
}

/** WebP keeps them in "EXIF" and "XMP " chunks. */
function webpHasMetadata(bytes: Uint8Array) {
  let i = 12;
  while (i + 8 <= bytes.length) {
    const chunk = ascii(bytes, i, 4);
    if (chunk === 'EXIF' || chunk === 'XMP ') return true;
    const size = (bytes[i + 4] | (bytes[i + 5] << 8) | (bytes[i + 6] << 16) | (bytes[i + 7] << 24)) >>> 0;
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
