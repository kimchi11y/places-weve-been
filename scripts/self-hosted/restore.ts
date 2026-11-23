/** What docker/restore.sh runs inside the container: REPLACES the site's trips and photos with a backup, after asking. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { exportData, missingFiles, photoKeys, replaceAll, type BackupData } from '../../src/server/backup';
import { localFolderPhotoStore } from '../../src/server/photos/local-folder';
import { openSqliteFile } from '../../src/server/stores/sqlite-file';

const stop = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const root = path.resolve(process.env.BACKUP_DIR || 'backups');
const data = path.resolve(process.env.DATA_DIR || 'data');
const name = path.basename(process.argv[2] ?? '');
if (!name) stop('Which backup? For example: docker/restore.sh 2026-11-06-143000-000');
if (!process.stdin.isTTY) stop('Replacing the site needs someone at the keyboard. Run this in a terminal.');

const backup: BackupData = JSON.parse(await readFile(path.join(root, name, 'backup.json'), 'utf8').catch(() => stop(`There's no finished backup called ${name}.`)));
const saved = localFolderPhotoStore(root);
const absent = await missingFiles(saved, photoKeys(backup.photos.map((p) => p.id)));
if (absent.length) stop(`${absent.length} of this backup's photo files aren't in backups/photos. Nothing was changed.`);

const db = await openSqliteFile(`file:${path.join(data, 'atlas.db')}`);
const current = await exportData(db);
console.log(`Backup from ${backup.createdAt}: ${backup.trips.length} trips, ${backup.photos.length} photos.`);
console.log(`Your site has now: ${current.trips.length} trips, ${current.photos.length} photos. They will be replaced.`);
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const answer = await prompt.question('Type "replace" to go ahead: ');
prompt.close();
if (answer.trim() !== 'replace') {
  console.log('Stopped. Nothing was changed.');
  process.exit(0);
}

const { copied, removed } = await replaceAll({ db, photos: localFolderPhotoStore(data), saved, backup });
console.log(`Restored. ${copied} photo files copied, ${removed} old ones removed.`);
