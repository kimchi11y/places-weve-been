/**
 * `npm run backup`: saves all your trips and photos from Cloudflare to this computer.
 *
 *   npm run backup                           into ./backups
 *   npm run backup -- --to ~/Dropbox/atlas   somewhere else (a synced or external drive is better)
 *   npm run backup -- --local                from the local simulation instead
 *
 * Each run adds a dated folder (backup.json, database.sql); the photos folder is shared
 * between them. Nothing on Cloudflare is changed.
 */
import { execFile } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { copyPhotos, exportData, photoKeys } from '../src/server/backup';
import { localFolderPhotoStore } from '../src/server/photos/local-folder';
import { connect } from './cloudflare-env';

const { values } = parseArgs({ options: { to: { type: 'string', default: 'backups' }, local: { type: 'boolean', default: false } } });
const root = path.resolve(values.to!);
const remote = !values.local;

const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const partial = path.join(root, `${stamp}.partial`);
const finished = path.join(root, stamp);
await mkdir(partial, { recursive: true });

const { db, photos } = connect({ remote });
console.log(`Backing up from ${remote ? 'your Cloudflare account' : 'the local simulation'} to ${root}`);
const data = await exportData(db);

const { copied, skipped, missing } = await copyPhotos(photos, localFolderPhotoStore(root), photoKeys(data.photos.map((p) => p.id)), {
  skipExisting: true,
  // The local simulation can't serve several Wrangler commands at once.
  concurrency: remote ? 6 : 1,
  onFile: (done, total) => {
    if (done % 20 === 0 || done === total) console.log(`  photo files: ${done} of ${total}`);
  },
});

await writeFile(path.join(partial, 'backup.json'), JSON.stringify(data, null, 2));
// The same data as plain SQL, readable by any SQLite tool, in case this project is ever gone.
await promisify(execFile)(path.resolve('node_modules/.bin/wrangler'), ['d1', 'export', 'DB', remote ? '--remote' : '--local', '--output', path.join(partial, 'database.sql')]);
await rename(partial, finished);

console.log(`Done: ${data.trips.length} trips, ${data.stops.length} stops, ${data.photos.length} photos.`);
console.log(`  ${copied} photo files downloaded, ${skipped} already saved.`);
console.log(`  Saved in ${finished}`);
if (missing.length) {
  console.error(`\nThe database lists ${missing.length} photo files that aren't in storage:\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
}
