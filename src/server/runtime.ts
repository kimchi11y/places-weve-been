/**
 * The stores and sign-in this deployment uses. On Cloudflare (and in `npm run dev`, which
 * simulates it) that's D1, R2 and Cloudflare Access, set up in wrangler.jsonc and the
 * Worker's settings. A Docker build would swap this one file.
 */
import { env } from 'cloudflare:workers';
import { cloudflareAccessAuth } from './auth/cloudflare-access';
import { devAuth, editorList, type Auth } from './auth/viewer';
import { r2PhotoStore } from './photos/r2';
import { d1TripStore } from './stores/d1';

export const tripStore = () => d1TripStore(env.DB);
export const photoStore = () => r2PhotoStore(env.PHOTOS);

let access: Auth | null | undefined;

/** How visitors sign in; null when the deployment isn't set up for it yet. */
export function auth(): Auth | null {
  if (import.meta.env.DEV) return devAuth;
  access ??= env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD ? cloudflareAccessAuth(env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD) : null;
  return access;
}

/** Who may use the editor: the EDITORS setting, a comma-separated list of emails. Anyone in `npm run dev`. */
export const canEdit = import.meta.env.DEV ? () => true : editorList(env.EDITORS ?? '');

/** PUBLIC_SITE=true lets anyone see the trips without signing in. The editor always needs it. */
export const isPublic = () => env.PUBLIC_SITE === 'true';
