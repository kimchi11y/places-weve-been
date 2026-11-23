// Fails the build if any image in dist/ (or the folder it's given) still carries GPS coordinates.
// Phone photos record where they were taken, including at home. Trip photos live in R2
// and lose their location when they're added; this catches one dropped into public/.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';

const dist = path.resolve(process.argv[2] ?? 'dist');
const images = (await readdir(dist, { recursive: true })).filter((f) => /\.(jpe?g|png|webp|avif|heic|tiff?)$/i.test(f));

const leaks = [];
for (const file of images) {
  try {
    const gps = await exifr.gps(await readFile(path.join(dist, file)));
    if (gps) leaks.push(`${file} (${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)})`);
  } catch {
    // no readable metadata at all
  }
}

if (leaks.length) {
  console.error(`\nThese published images still contain the location they were taken:\n  ${leaks.join('\n  ')}\n`);
  process.exit(1);
}
console.log(`Photo privacy: checked ${images.length} images, none contain GPS location.`);
