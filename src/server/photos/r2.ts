/** Photos in a Cloudflare R2 bucket. Keep the bucket private: the Worker serves them behind Access. */
import type { R2Bucket } from '@cloudflare/workers-types';
import { safeKey, type PhotoStore } from './photo-store';

export const r2PhotoStore = (bucket: R2Bucket): PhotoStore => ({
  async put(key, bytes, contentType) {
    await bucket.put(safeKey(key), bytes, { httpMetadata: { contentType } });
  },
  async get(key) {
    const object = await bucket.get(safeKey(key));
    if (!object) return null;
    return {
      // Workers' own ReadableStream type; it's the same stream at runtime.
      body: object.body as unknown as ReadableStream<Uint8Array>,
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      size: object.size,
    };
  },
  async delete(keys) {
    // R2 deletes at most 1000 keys per call.
    for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000).map(safeKey));
  },
});
