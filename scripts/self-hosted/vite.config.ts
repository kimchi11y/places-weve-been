import { defineConfig } from 'vite';

/** Bundles the two scripts for the Docker image, which has no TypeScript tools. */
export default defineConfig({
  publicDir: false,
  build: {
    ssr: true,
    target: 'node26',
    outDir: 'dist-node/tools',
    rollupOptions: { input: { backup: 'scripts/self-hosted/backup.ts', restore: 'scripts/self-hosted/restore.ts' }, output: { entryFileNames: '[name].mjs' } },
  },
});
