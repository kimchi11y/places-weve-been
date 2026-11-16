// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
  // Pages are made on each visit by the Worker, from the trips in D1 and the photos in R2.
  output: 'server',
  // Photos are resized once, when they're added, so nothing is resized on the fly.
  adapter: cloudflare({ imageService: 'passthrough' }),
  // Nothing is kept per visitor, so no KV namespace for sessions is needed.
  session: false,
  integrations: [react()],
  devToolbar: { enabled: false },
});
