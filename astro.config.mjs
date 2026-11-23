// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig, passthroughImageService } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import react from '@astrojs/react';

// `npm run build:node` makes the site for your own server instead of Cloudflare.
const selfHosted = process.env.TARGET === 'node';
const platform = selfHosted ? 'node' : 'cloudflare';

export default defineConfig({
  // Pages are made on each visit, from the trips in the database and the photos in the photo store.
  output: 'server',
  // Photos are resized once, when they're added, so nothing is resized on the fly.
  adapter: selfHosted ? node({ mode: 'standalone', bodySizeLimit: 100 * 1024 * 1024 }) : cloudflare({ imageService: 'passthrough' }),
  image: { service: passthroughImageService() },
  outDir: selfHosted ? './dist-node' : './dist',
  // Behind a proxy the server can't see the address people use, so Astro's check would refuse
  // every upload. The editor's own header (src/middleware.ts) already stops other websites.
  security: { checkOrigin: !selfHosted },
  // Nothing is kept per visitor, so no KV namespace for sessions is needed.
  session: false,
  integrations: [react()],
  devToolbar: { enabled: false },
  vite: { resolve: { alias: { '#platform': fileURLToPath(new URL(`./src/server/platform/${platform}.ts`, import.meta.url)) } } },
});
