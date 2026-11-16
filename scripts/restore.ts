/**
 * `npm run restore -- <backup folder>`: puts a backup into the local simulation, so you can
 * look at it with `npm run dev`. Your live site isn't touched.
 *
 *   npm run restore -- backups/2026-11-06-1430
 *   npm run restore -- backups/2026-11-06-1430 --remote     REPLACES the live site, after asking
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs, promisify } from 'node:util';
import { copyPhotos, exportData, importData, photoKeys, type BackupData } from '../src/server/backup';
import { localFolderPhotoStore } from '../src/server/photos/local-folder';
import { connect } from './cloudflare-env';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { remote: { type: 'boolean', default: false } } });
const folder = positionals[0] && path.resolve(positionals[0]);
if (!folder) {
  console.error('Which backup? For example: npm run restore -- backups/2026-11-06-1430');
  process.exit(1);
}
const remote = values.remote!;
// Checked first, so without someone at the keyboard this never even connects to the live site.
if (remote && !process.stdin.isTTY) {
  console.error('Replacing the live site needs someone at the keyboard. Run this in a terminal.');
  process.exit(1);
}

const backup: BackupData = JSON.parse(await readFile(path.join(folder, 'backup.json'), 'utf8'));
// The photos folder sits next to the dated folders.
const saved = localFolderPhotoStore(path.dirname(folder));
const wanted = photoKeys(backup.photos.map((p) => p.id));
const absent = (await Promise.all(wanted.map(async (key) => {
  const file = await saved.get(key);
  await file?.body.cancel();
  return file ? null : key;
}))).filter(Boolean);
if (absent.length) {
  console.error(`${absent.length} of this backup's photo files aren't in ${path.dirname(folder)}/photos. Nothing was changed.`);
  process.exit(1);
}

const where = remote ? '--remote' : '--local';
await promisify(execFile)(path.resolve('node_modules/.bin/wrangler'), ['d1', 'migrations', 'apply', 'DB', where], { env: { ...process.env, CI: 'true' } });

const { db, photos } = connect({ remote });
const current = await exportData(db);
console.log(`Backup from ${backup.createdAt}: ${backup.trips.length} trips, ${backup.photos.length} photos.`);
console.log(`${remote ? 'Your LIVE site' : 'The local simulation'} has now: ${current.trips.length} trips, ${current.photos.length} photos. They will be replaced.`);

if (remote) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('Type "replace" to go ahead: ');
  prompt.close();
  if (answer.trim() !== 'replace') {
    console.log('Stopped. Nothing was changed.');
    process.exit(0);
  }
}

// New files first, then the database, then old files: a failure never leaves rows without photos.
const { copied } = await copyPhotos(saved, photos, wanted, {
  concurrency: remote ? 6 : 1,
  onFile: (done, total) => {
    if (done % 20 === 0 || done === total) console.log(`  photo files: ${done} of ${total}`);
  },
});
await importData(db, backup);
const keep = new Set(backup.photos.map((p) => p.id));
const stale = photoKeys(current.photos.map((p) => p.id).filter((id) => !keep.has(id)));
await photos.delete(stale);

console.log(`Restored. ${copied} photo files uploaded, ${stale.length} old ones removed.`);
