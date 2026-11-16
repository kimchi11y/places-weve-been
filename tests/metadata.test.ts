import sharp, { type Sharp } from 'sharp';
import { describe, expect, it } from 'vitest';
import { hasMetadata, sniffType, stripJpegMetadata } from '../src/server/photos/metadata';

const image = () => sharp({ create: { width: 8, height: 6, channels: 3, background: '#2340d0' } });
const bytes = async (s: Sharp) => new Uint8Array(await s.toBuffer());
/** What a phone writes: where it was taken. */
const withGps = (s: Sharp) => s.withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 33/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '126/1 58/1 0/1' } });

describe('photo metadata check', () => {
  it('lets plain JPEG and WebP through', async () => {
    const jpeg = await bytes(image().jpeg());
    const webp = await bytes(image().webp());
    expect([sniffType(jpeg), sniffType(webp)]).toEqual(['image/jpeg', 'image/webp']);
    expect([hasMetadata(jpeg), hasMetadata(webp)]).toEqual([false, false]);
  });

  it('stops photos that still say where they were taken', async () => {
    for (const format of ['jpeg', 'webp'] as const) {
      const photo = await bytes(withGps(image())[format]());
      expect((await sharp(photo).metadata()).exif?.length).toBeGreaterThan(0); // it really does carry the location
      expect(hasMetadata(photo)).toBe(true);
    }
  });

  it('stops anything that isn’t a JPEG or WebP', async () => {
    const png = await bytes(image().png());
    expect(sniffType(png)).toBeUndefined();
    expect(hasMetadata(png)).toBe(true);
    expect(hasMetadata(new TextEncoder().encode('<script>alert(1)</script>'))).toBe(true);
  });

  it('removes what a browser or camera wrote into a JPEG, leaving the picture intact', async () => {
    const plain = await bytes(image().jpeg());
    const photo = await bytes(withGps(image()).withIccProfile('srgb').jpeg());
    expect(hasMetadata(photo)).toBe(true);
    const clean = stripJpegMetadata(photo);
    expect(hasMetadata(clean)).toBe(false);
    const after = await sharp(clean).metadata();
    expect(after.exif).toBeUndefined();
    expect([after.width, after.height]).toEqual([8, 6]);
    expect(stripJpegMetadata(plain)).toEqual(plain);
  });

  it('leaves a cut-off JPEG for the check to refuse', async () => {
    const jpeg = await bytes(withGps(image()).jpeg());
    expect(hasMetadata(stripJpegMetadata(jpeg.subarray(0, 10)))).toBe(true);
  });

  it('stops cut-off files instead of guessing', async () => {
    const jpeg = await bytes(image().jpeg());
    expect(hasMetadata(jpeg.subarray(0, 10))).toBe(true);
  });
});
