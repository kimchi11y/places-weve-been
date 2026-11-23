/**
 * What docker/backup.sh runs inside the container: saves every trip and photo from DATA_DIR to
 * /backups, in the same format as `npm run backup`. Only reads the site's data, which can stay up.
 */
import { createClient } from '@libsql/client';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { copyPhotos, exportData, photoKeys } from '../../src/server/backup';
import { localFolderPhotoStore } from '../../src/server/photos/local-folder';
import { openSqliteFile } from '../../src/server/stores/sqlite-file';

const data = path.resolve(process.env.DATA_DIR || 'data');
const root = path.resolve(process.env.BACKUP_DIR || 'backups');
const database = path.join(data, 'atlas.db');
await access(database).catch(() => {
  console.error('There is nothing to back up yet: the site has no database.');
  process.exit(1);
});

// Down to the millisecond, so two backups don't share a folder
const stamp = new Date().toISOString().slice(0, 23).replace('T', '-').replaceAll(':', '').replace('.', '-');
const partial = path.join(root, `${stamp}.partial`);
const finished = path.join(root, stamp);
await mkdir(partial, { recursive: true });

// A copy made in one go, so a save halfway through can't end up in it. Any SQLite tool can read it.
const copy = path.join(partial, 'atlas.db');
const live = createClient({ url: `file:${database}`, timeout: 5000 });
await live.execute({ sql: 'VACUUM INTO ?', args: [copy] });
live.close();
const rows = await exportData(await openSqliteFile(`file:${copy}`));

const { copied, skipped, missing } = await copyPhotos(localFolderPhotoStore(data), localFolderPhotoStore(root), photoKeys(rows.photos.map((p) => p.id)), { skipExisting: true });
await writeFile(path.join(partial, 'backup.json'), JSON.stringify(rows, null, 2));
await rename(partial, finished);

console.log(`Done: ${rows.trips.length} trips, ${rows.stops.length} stops, ${rows.photos.length} photos.`);
console.log(`  ${copied} photo files copied, ${skipped} already saved.`);
console.log(`  Saved in backups/${stamp}`);
if (missing.length) {
  console.error(`\nThe database lists ${missing.length} photo files that aren't in storage:\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
}
