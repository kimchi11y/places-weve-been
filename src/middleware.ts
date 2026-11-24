/**
 * Runs before every page, photo and editor request: works out who's asking, and turns away
 * anyone who isn't allowed. Trips need a signed-in visitor; the editor needs one listed in
 * EDITORS. If sign-in isn't set up, everything stays closed.
 */
import type { APIContext } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { json } from './server/http';
import { auth, canEdit } from './server/runtime';

/** Pages get a page back (pages/refused.astro); the editor's requests and photos get a short answer. */
function refuse(context: APIContext, refusal: App.Refusal) {
  const { pathname } = context.url;
  if (pathname.startsWith('/admin/api/')) return json({ error: refusal.message }, refusal.status);
  if (context.request.method !== 'GET' || pathname.startsWith('/photos/')) {
    return new Response(refusal.message, { status: refusal.status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  context.locals.refusal = refusal;
  return context.rewrite('/refused');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  // Showing the refusal itself comes back through here. Only refuse() sets it, never a visitor.
  if (context.locals.refusal && pathname === '/refused') return next();

  const forEditor = pathname === '/admin' || pathname.startsWith('/admin/');
  const signIn = auth();
  if (!signIn) {
    return refuse(context, { reason: 'setup', status: 503, message: 'This site isn’t set up for signing in yet. See the README for the settings it needs.' });
  }

  const viewer = await signIn.viewer(context.request);
  context.locals.viewer = viewer;
  if (!viewer) return refuse(context, { reason: 'sign-in', status: 403, message: 'Please sign in to see this site.' });
  if (forEditor && !canEdit(viewer)) {
    return refuse(context, { reason: 'editors', status: 403, message: `${viewer.email} can see the site but not edit it. Ask whoever runs it to add you to EDITORS.` });
  }

  // Other websites open in the same browser can send requests here too. They can't add this
  // header without permission, so only the editor itself can change anything.
  if (forEditor && context.request.method !== 'GET' && context.request.headers.get('x-places-weve-been') !== '1') {
    return refuse(context, { reason: 'editors', status: 403, message: 'Changes must come from the editor.' });
  }
  return next();
});
