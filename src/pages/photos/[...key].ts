/**
 * Photo files, straight from the photo store: /photos/<photo-id>/<size>.webp.
 * The bucket itself stays private; Cloudflare Access guards this route like every page.
 */
import type { APIRoute } from 'astro';
import { photoStore } from '../../server/runtime';

const notFound = () => new Response('Not found', { status: 404 });

export const GET: APIRoute = async ({ params }) => {
  let file;
  try {
    file = await photoStore().get(`photos/${params.key}`);
  } catch {
    return notFound(); // not a valid key
  }
  if (!file) return notFound();
  return new Response(file.body, {
    headers: {
      'content-type': file.contentType,
      'content-length': String(file.size),
      // A photo id's files never change, so browsers can keep them. "private": never in shared caches.
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
};
