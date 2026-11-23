import { describe, expect, it, vi } from 'vitest';
import { r2PhotoStore } from '../src/server/photos/r2';

const bucket = () => ({ put: vi.fn(), get: vi.fn(async () => null as unknown), delete: vi.fn() });
const keys = (n: number) => Array.from({ length: n }, (_, i) => `photos/p${i}/full`);

describe('R2 photo store', () => {
  it('deletes at most 1000 keys per call', async () => {
    for (const [count, sizes] of [[0, []], [1000, [1000]], [1001, [1000, 1]]] as const) {
      const b = bucket();
      await r2PhotoStore(b as never).delete(keys(count));
      expect(b.delete.mock.calls.map(([batch]) => batch.length)).toEqual(sizes);
    }
  });

  it('remembers content types, and has a fallback', async () => {
    const b = bucket();
    const store = r2PhotoStore(b as never);
    await store.put('photos/p1/full', new Uint8Array([1]), 'image/webp');
    expect(b.put).toHaveBeenCalledWith('photos/p1/full', new Uint8Array([1]), { httpMetadata: { contentType: 'image/webp' } });
    expect(await store.get('photos/p1/full')).toBeNull();
    b.get.mockResolvedValue({ body: null, size: 1 });
    expect(await store.get('photos/p1/full')).toMatchObject({ contentType: 'application/octet-stream', size: 1 });
  });

  it('never touches invalid keys', async () => {
    const b = bucket();
    const store = r2PhotoStore(b as never);
    await expect(store.get('../x')).rejects.toThrow('Not a valid photo key');
    await expect(store.delete(['photos/../x'])).rejects.toThrow('Not a valid photo key');
    expect(b.get).not.toHaveBeenCalled();
    expect(b.delete).not.toHaveBeenCalled();
  });
});
