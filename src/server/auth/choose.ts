/** Turns a deployment's settings into how its visitors sign in. */
import { cloudflareAccessAuth } from './cloudflare-access';
import type { Auth } from './viewer';

export interface Settings {
  AUTH?: string;
  /** "yourteam.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN?: string;
  /** the Access application's audience tag */
  ACCESS_AUD?: string;
  /** emails allowed to use the editor, comma-separated */
  EDITORS?: string;
}

/** null when it isn't set up, or not in a way that's safe: everything then stays closed. */
export function chooseAuth(settings: Settings): Auth | null {
  if (settings.AUTH === 'access' && settings.ACCESS_TEAM_DOMAIN && settings.ACCESS_AUD) {
    return cloudflareAccessAuth(settings.ACCESS_TEAM_DOMAIN, settings.ACCESS_AUD);
  }
  return null;
}
