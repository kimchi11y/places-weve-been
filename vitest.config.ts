import { defineConfig } from 'vitest/config';

// Kept apart from astro.config.mjs so tests don't start the Cloudflare adapter.
// Component tests ask for a browser-like page with `@vitest-environment jsdom`.
export default defineConfig({
  test: { include: ['tests/**/*.test.{ts,tsx}'] },
});
