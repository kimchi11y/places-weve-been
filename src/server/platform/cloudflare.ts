/** Cloudflare, and `npm run dev`, which simulates it: D1 and R2, set up in wrangler.jsonc and the Worker's settings. */
import { env } from 'cloudflare:workers';
import { r2PhotoStore } from '../photos/r2';
import { d1TripStore } from '../stores/d1';
import type { Platform } from './platform';

export const tripStore: Platform['tripStore'] = () => d1TripStore(env.DB);
export const photoStore: Platform['photoStore'] = () => r2PhotoStore(env.PHOTOS);

export const settings: Platform['settings'] = {
  // Anyone can send a Worker any header, so only Access's signed token can be trusted here
  AUTH: 'access',
  ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN,
  ACCESS_AUD: env.ACCESS_AUD,
  EDITORS: env.EDITORS,
};
