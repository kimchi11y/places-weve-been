import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deletePhotoFiles, photoKey } from '../src/server/photos/photo-store';
import { localFolderPhotoStore } from '../src/server/photos/local-folder';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'atlas-photos-'));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('local folder photo store', () => {
  it('stores, serves and deletes photo files', async () => {
    const store = localFolderPhotoStore(root);
    const bytes = new Uint8Array([1, 2, 3]);
    await store.put(photoKey('p1', 'thumb'), bytes, 'image/webp');
    const file = await store.get(photoKey('p1', 'thumb'));
    expect(file).toMatchObject({ contentType: 'image/webp', size: 3 });
    expect(new Uint8Array(await new Response(file!.body).arrayBuffer())).toEqual(bytes);

    await deletePhotoFiles(store, ['p1']);
    expect(await store.get(photoKey('p1', 'thumb'))).toBeNull();
  });

  it('never reads or writes outside its folder', async () => {
    const store = localFolderPhotoStore(root);
    for (const key of ['../secret.webp', '/etc/passwd', 'photos/../../x', 'photos//x', '.hidden']) {
      await expect(store.get(key)).rejects.toThrow('Not a valid photo key');
    }
  });
});
