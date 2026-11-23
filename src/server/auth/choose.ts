/** Turns a deployment's settings into how its visitors sign in. */
import { cloudflareAccessAuth } from './cloudflare-access';
import { tailscaleAuth } from './tailscale';
import type { Auth } from './viewer';

export interface Settings {
  /** "access" or "tailscale" */
  AUTH?: string;
  /** "yourteam.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** the Access application's audience tag */
  ACCESS_AUD?: string;
  /** emails allowed to use the editor, comma-separated */
  EDITORS?: string;
  /** the address a self-hosted site listens on; this computer alone unless it's set */
  HOST?: string;
}

const THIS_COMPUTER = ['localhost', '127.0.0.1', '::1'];

/** null when it isn't set up, or not in a way that's safe: everything then stays closed. */
export function chooseAuth(settings: Settings): Auth | null {
  if (settings.AUTH === 'access' && settings.ACCESS_TEAM_DOMAIN && settings.ACCESS_AUD) {
    return cloudflareAccessAuth(settings.ACCESS_TEAM_DOMAIN, settings.ACCESS_AUD);
  }
  // Anyone who can reach the site without going through Tailscale Serve could say they're someone else
  if (settings.AUTH === 'tailscale' && THIS_COMPUTER.includes(settings.HOST ?? 'localhost')) return tailscaleAuth;
  return null;
}
