import { beforeEach, describe, expect, it, vi } from 'vitest';

const site = vi.hoisted(() => ({
  viewer: null as { email: string } | null,
  signIn: true,
}));
vi.mock('astro:middleware', () => ({ defineMiddleware: (handler: unknown) => handler }));
vi.mock('../src/server/runtime', () => ({
  auth: () => (site.signIn ? { viewer: async () => site.viewer } : null),
  canEdit: (viewer: { email: string } | null) => viewer?.email === 'ana@example.com',
}));
import { onRequest } from '../src/middleware';

async function visit(path: string, { method = 'GET', headers = {} as Record<string, string> } = {}) {
  const request = new Request(`https://atlas.example${path}`, { method, headers });
  const locals: Record<string, unknown> = {};
  const next = vi.fn(async () => new Response('the page'));
  // Like pages/refused.astro, which takes its status from what the middleware left in locals
  const rewrite = vi.fn(async (_to: string) => new Response('the refusal', { status: (locals.refusal as App.Refusal).status }));
  const response = (await onRequest({ url: new URL(request.url), request, locals, rewrite } as never, next)) as Response;
  return { status: response.status, type: response.headers.get('content-type'), body: await response.text(), let: next.mock.calls.length === 1, shown: rewrite.mock.calls[0]?.[0], locals };
}

beforeEach(() => Object.assign(site, { viewer: null, signIn: true }));

describe('who gets in', () => {
  it('keeps everything closed until sign-in is set up', async () => {
    site.signIn = false;
    for (const path of ['/', '/trips/jeju-2025', '/photos/p1/full', '/admin', '/admin/api/trips']) {
      expect(await visit(path)).toMatchObject({ status: 503, let: false });
    }
  });

  it('turns away people who are not signed in', async () => {
    for (const path of ['/', '/trips/jeju-2025', '/photos/p1/full', '/admin', '/admin/api/trips']) {
      expect(await visit(path)).toMatchObject({ status: 403, let: false });
    }
  });

  it('lets family see the trips but not edit them', async () => {
    site.viewer = { email: 'grandma@example.com' };
    expect(await visit('/trips/jeju-2025')).toMatchObject({ status: 200, let: true, locals: { viewer: site.viewer } });
    for (const path of ['/admin', '/admin/', '/admin/api/trips', '/admin/api/trips/jeju-2025/photos']) {
      expect(await visit(path)).toMatchObject({ status: 403, let: false });
    }
  });

  it('lets editors in', async () => {
    site.viewer = { email: 'ana@example.com' };
    expect(await visit('/admin')).toMatchObject({ status: 200, let: true });
    expect(await visit('/admin/api/trips')).toMatchObject({ status: 200, let: true });
  });

  it('only treats /admin and what’s under it as the editor', async () => {
    site.viewer = { email: 'grandma@example.com' };
    expect(await visit('/administrator')).toMatchObject({ status: 200, let: true });
    expect(await visit('/admin?x=1')).toMatchObject({ status: 403, let: false });
  });
});

describe('what people who are turned away get', () => {
  it('shows a page saying why, in place of a page', async () => {
    expect(await visit('/')).toMatchObject({ shown: '/refused', locals: { refusal: { reason: 'sign-in' } } });
    site.viewer = { email: 'grandma@example.com' };
    expect(await visit('/admin')).toMatchObject({ shown: '/refused', locals: { refusal: { reason: 'editors' } } });
    site.signIn = false;
    expect(await visit('/')).toMatchObject({ shown: '/refused', locals: { refusal: { reason: 'setup' } } });
  });

  it('answers the editor’s requests and photos without a page', async () => {
    expect(JSON.parse((await visit('/admin/api/trips')).body)).toEqual({ error: 'Please sign in to see this site.' });
    expect(await visit('/photos/p1/full')).toMatchObject({ shown: undefined, type: 'text/plain; charset=utf-8' });
    expect(await visit('/', { method: 'POST' })).toMatchObject({ status: 403, shown: undefined, let: false });
  });

  it('doesn’t let anyone in by asking for the refusal itself', async () => {
    expect(await visit('/refused')).toMatchObject({ status: 403, let: false });
  });
});

describe('changes from other websites', () => {
  it('only accepts changes that carry the editor’s header', async () => {
    site.viewer = { email: 'ana@example.com' };
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect(await visit('/admin/api/trips', { method })).toMatchObject({ status: 403, let: false });
      expect(await visit('/admin/api/trips', { method, headers: { 'x-places-weve-been': 'yes' } })).toMatchObject({ status: 403, let: false });
      expect(await visit('/admin/api/trips', { method, headers: { 'x-places-weve-been': '1' } })).toMatchObject({ status: 200, let: true });
    }
  });
});
