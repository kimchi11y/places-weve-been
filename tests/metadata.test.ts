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

  // What a camera or app can also write: a comment, or a location after the picture has started
  const app1 = [0xff, 0xe1, 0, 8, ...new TextEncoder().encode('Exif\0\0')];
  const join = (...parts: ArrayLike<number>[]) => Uint8Array.from(parts.flatMap((p) => Array.from(p)));

  it('stops comments, and details hidden after the picture starts', async () => {
    const jpeg = await bytes(image().jpeg());
    const comment = join(jpeg.subarray(0, 2), [0xff, 0xfe, 0, 6, 71, 80, 83, 33], jpeg.subarray(2));
    const late = join(jpeg.subarray(0, -2), app1, [0xff, 0xd9]);
    const after = join(jpeg, app1);
    for (const photo of [comment, late, after]) {
      expect(hasMetadata(photo)).toBe(true);
      const clean = stripJpegMetadata(photo);
      expect(hasMetadata(clean)).toBe(false);
      expect(await sharp(clean).raw().toBuffer()).toEqual(await sharp(jpeg).raw().toBuffer());
    }
  });

  it('understands every kind of JPEG people upload', async () => {
    const noise = sharp({ create: { width: 200, height: 150, channels: 3, background: '#888', noise: { type: 'gaussian', mean: 128, sigma: 60 } } });
    for (const options of [{ progressive: true }, { mozjpeg: true }, { quality: 100, chromaSubsampling: '4:4:4' }]) {
      const jpeg = await bytes(noise.clone().jpeg(options));
      expect(hasMetadata(jpeg)).toBe(false);
      expect(stripJpegMetadata(jpeg)).toEqual(jpeg);
      const photo = await bytes(withGps(noise.clone()).jpeg(options));
      expect(hasMetadata(photo)).toBe(true);
      expect(hasMetadata(stripJpegMetadata(photo))).toBe(false);
    }
  });

  it('stops a JPEG without an end', async () => {
    const jpeg = await bytes(image().jpeg());
    expect(hasMetadata(jpeg.subarray(0, -2))).toBe(true);
  });

  it('stops a WebP whose chunk sizes make no sense', async () => {
    const chunk = (size: number[]) => join(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '), size, new Uint8Array(20));
    for (const size of [[0xff, 0xff, 0xff, 0xff], [0, 0, 0, 0x80], [0xff, 0xff, 0, 0]]) expect(hasMetadata(chunk(size))).toBe(true);
    // minus eight, read as a signed number: this one used to loop forever
    expect(hasMetadata(chunk([0xf8, 0xff, 0xff, 0xff]))).toBe(true);
  });

  it('stops cut-off files instead of guessing', async () => {
    const jpeg = await bytes(image().jpeg());
    expect(hasMetadata(jpeg.subarray(0, 10))).toBe(true);
  });
});
