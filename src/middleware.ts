/**
 * Runs before every page, photo and editor request: works out who's asking, and turns away
 * anyone who isn't allowed. Trips need a signed-in visitor; the editor needs one listed in
 * EDITORS. If sign-in isn't set up, everything stays closed.
 */
import { defineMiddleware } from 'astro:middleware';
import { auth, canEdit } from './server/runtime';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const refuse = (status: number, message: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><title>Not available</title><p style="font:16px system-ui;margin:3rem">${escapeHtml(message)}</p>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const forEditor = pathname === '/admin' || pathname.startsWith('/admin/');
  const signIn = auth();
  if (!signIn) {
    return refuse(503, 'This site isn’t set up for signing in yet. See “Deploying” in the README: it needs ACCESS_TEAM_DOMAIN and ACCESS_AUD.');
  }

  const viewer = await signIn.viewer(context.request);
  context.locals.viewer = viewer;
  if (!viewer) return refuse(403, 'Please sign in to see this site.');
  if (forEditor && !canEdit(viewer)) return refuse(403, `${viewer.email} can see the site but not edit it. Ask whoever runs it to add you to EDITORS.`);

  // Other websites open in the same browser can send requests here too. They can't add this
  // header without permission, so only the editor itself can change anything.
  if (forEditor && context.request.method !== 'GET' && context.request.headers.get('x-places-weve-been') !== '1') {
    return refuse(403, 'Changes must come from the editor.');
  }
  return next();
});
