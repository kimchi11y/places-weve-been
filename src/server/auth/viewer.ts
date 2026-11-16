/**
 * Who is looking at the site. Pages and the editor only ask this interface, so how people
 * sign in can change: Cloudflare Access today (cloudflare-access.ts), or a sign-in built into
 * the site later, without touching the pages or the editor.
 */

export interface Viewer {
  email: string;
}

export interface Auth {
  /** The signed-in person, or null when the request doesn't prove who sent it. */
  viewer(request: Request): Promise<Viewer | null>;
}

/** `npm run dev`: the site only runs on your own computer, so you're always signed in. */
export const devAuth: Auth = {
  viewer: async () => ({ email: 'you@localhost' }),
};

/** "Ana@Example.com, bo@example.com" → a check for whether someone may use the editor */
export function editorList(emails: string) {
  const allowed = new Set(emails.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  return (viewer: Viewer | null) => !!viewer && allowed.has(viewer.email.toLowerCase());
}
