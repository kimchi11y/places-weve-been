/** Trips in Cloudflare D1. Wrangler applies the migrations: `wrangler d1 migrations apply`. */
import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../schema/tables';
import { createSqliteTripStore } from './sqlite';

export const d1TripStore = (binding: D1Database) => createSqliteTripStore(drizzle(binding, { schema }));
