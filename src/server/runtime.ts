/** The stores and sign-in this deployment uses; `#platform` is where it runs (platform/). */
import { settings } from '#platform';
import { chooseAuth } from './auth/choose';
import { devAuth, editorList, type Auth } from './auth/viewer';

export { photoStore, tripStore } from '#platform';

let chosen: Auth | null | undefined;

/** How visitors sign in; null when the deployment isn't set up for it yet. */
export function auth(): Auth | null {
  if (import.meta.env.DEV) return devAuth;
  chosen ??= chooseAuth(settings);
  return chosen;
}

/** Who may use the editor: the EDITORS setting, a comma-separated list of emails. Anyone in `npm run dev`. */
export const canEdit = import.meta.env.DEV ? () => true : editorList(settings.EDITORS ?? '');
