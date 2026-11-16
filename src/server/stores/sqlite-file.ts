/**
 * Trips in a plain SQLite file, for Docker and the tests. The url can also be
 * ":memory:" (tests) or a Turso database ("libsql://…"). Migrations run on open.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from '../../schema/tables';
import { createSqliteTripStore } from './sqlite';

export async function openSqliteFile(url = 'file:data/atlas.db', options: { authToken?: string } = {}) {
  if (url.startsWith('file:')) await mkdir(path.dirname(url.slice('file:'.length)), { recursive: true });
  const client = createClient({ url, authToken: options.authToken });
  // SQLite leaves foreign keys off unless asked, each time it opens; D1 always has them on.
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve('migrations') });
  return db;
}

export const sqliteFileTripStore = async (url?: string, options?: { authToken?: string }) =>
  createSqliteTripStore(await openSqliteFile(url, options));
