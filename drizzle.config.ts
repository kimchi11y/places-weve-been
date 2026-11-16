// `npm run db:generate` compares src/schema/tables.ts with the migrations so far and writes
// the next one. The same folder is what `wrangler d1 migrations apply` reads.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/tables.ts',
  out: './migrations',
});
