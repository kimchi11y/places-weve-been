/** Photos in a folder on disk, for Docker (/data/photos) and the tests. */
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { safeKey, type PhotoStore } from './photo-store';

/** Files are named <key>.<extension>, which is how their content type is remembered. */
const EXTENSIONS: Record<string, string> = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/avif': '.avif' };

export function localFolderPhotoStore(root = 'data/photos'): PhotoStore {
  const base = path.resolve(root);
  const stemOf = (key: string) => {
    const stem = path.resolve(base, safeKey(key));
    if (!stem.startsWith(base + path.sep)) throw new Error(`Not a valid photo key: ${key}`);
    return stem;
  };
  const candidates = (key: string) => Object.entries(EXTENSIONS).map(([type, ext]) => ({ type, file: stemOf(key) + ext }));
  const remove = (keys: string[]) => Promise.all(keys.flatMap(candidates).map(({ file }) => rm(file, { force: true })));

  return {
    async put(key, bytes, contentType) {
      const extension = EXTENSIONS[contentType];
      if (!extension) throw new Error(`Can't store ${contentType} files`);
      await remove([key]);
      const file = stemOf(key) + extension;
      await mkdir(path.dirname(file), { recursive: true });
      // Write next to it, then swap in, so a half-written photo is never served.
      const partial = `${file}.${process.pid}.partial`;
      await writeFile(partial, bytes);
      await rename(partial, file);
    },
    async get(key) {
      for (const { type, file } of candidates(key)) {
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) continue;
        return { body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, contentType: type, size: info.size };
      }
      return null;
    },
    async delete(keys) {
      await remove(keys);
    },
  };
}
