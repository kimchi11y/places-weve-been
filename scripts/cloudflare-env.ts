/**
 * The database and photo storage for scripts: the local simulation `npm run dev` uses, or
 * with `remote` the real ones on your Cloudflare account. Everything goes through Wrangler's
 * own commands, signed in with `wrangler login`. (Its "remote bindings" feature won't do:
 * it goes through a workers.dev preview, which Cloudflare Access rightly blocks.)
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { unstable_readConfig } from 'wrangler';
import * as schema from '../src/schema/tables';
import { sniffType } from '../src/server/photos/metadata';
import type { PhotoStore } from '../src/server/photos/photo-store';
import type { AtlasDb } from '../src/server/stores/sqlite';

const WRANGLER = path.resolve('node_modules/.bin/wrangler');
const run = promisify(execFile);
const wrangler = (args: string[]) => run(WRANGLER, args, { maxBuffer: 512 * 1024 * 1024, env: { ...process.env, CI: 'true' } });

/** Values go straight into SQL text, since `wrangler d1 execute` can't send parameters. */
function literal(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}
const inline = (sql: string, params: unknown[]) => {
  let i = 0;
  return sql.replace(/\?/g, () => literal(params[i++]));
};

export function connect({ remote }: { remote: boolean }) {
  const where = remote ? '--remote' : '--local';
  const bucket = unstable_readConfig({ config: 'wrangler.jsonc' }).r2_buckets[0].bucket_name;

  async function withTempDir<T>(use: (dir: string) => Promise<T>) {
    const dir = await mkdtemp(path.join(tmpdir(), 'atlas-'));
    try {
      return await use(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  const query = async (sql: string) => {
    const { stdout } = await wrangler(['d1', 'execute', 'DB', where, '--json', '--command', sql]);
    return JSON.parse(stdout)[0].results as Record<string, unknown>[];
  };
  const db = drizzle(
    async (sql, params) => ({ rows: (await query(inline(sql, params))).map((row) => Object.values(row)) }),
    (queries) =>
      withTempDir(async (dir) => {
        const file = path.join(dir, 'batch.sql');
        await writeFile(file, queries.map((q) => `${inline(q.sql, q.params)};`).join('\n'));
        await wrangler(['d1', 'execute', 'DB', where, '--yes', '--file', file]);
        return queries.map(() => ({ rows: [] }));
      }),
    { schema },
  ) as unknown as AtlasDb;

  const object = (key: string) => `${bucket}/${key}`;
  const photos: PhotoStore = {
    put: (key, bytes, contentType) =>
      withTempDir(async (dir) => {
        const file = path.join(dir, 'photo');
        await writeFile(file, bytes);
        await wrangler(['r2', 'object', 'put', object(key), where, '--file', file, '--content-type', contentType]);
      }),
    get: (key) =>
      withTempDir(async (dir) => {
        const file = path.join(dir, 'photo');
        try {
          await wrangler(['r2', 'object', 'get', object(key), where, '--file', file]);
        } catch (error) {
          if (/does not exist|not found/i.test(String((error as { stderr?: string }).stderr) + String((error as { stdout?: string }).stdout))) return null;
          throw error;
        }
        const bytes = await readFile(file);
        const contentType = sniffType(bytes) ?? 'application/octet-stream';
        return { body: new Blob([bytes]).stream(), contentType, size: bytes.length };
      }),
    async delete(keys) {
      for (const key of keys) await wrangler(['r2', 'object', 'delete', object(key), where]);
    },
  };

  return { db, photos };
}
