import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cloudflareAccessAuth } from '../src/server/auth/cloudflare-access';
import { editorList } from '../src/server/auth/viewer';

const TEAM = 'family.cloudflareaccess.com';
const AUD = 'atlas-app-aud';
let sign: (claims: Record<string, unknown>, options?: { key?: CryptoKey; expires?: string }) => Promise<string>;
let otherKey: CryptoKey;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  // Stand in for Access's published keys at https://<team>/cdn-cgi/access/certs
  vi.stubGlobal('fetch', async (url: string | URL) =>
    String(url) === `https://${TEAM}/cdn-cgi/access/certs` ? Response.json({ keys: [jwk] }) : new Response(null, { status: 404 }));
  sign = (claims, { key = privateKey, expires = '1h' } = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(`https://${TEAM}`).setAudience(AUD).setIssuedAt().setExpirationTime(expires).sign(key);
});
afterEach(() => vi.clearAllMocks());

const request = (token?: string) => new Request('https://atlas.example/', { headers: token ? { 'cf-access-jwt-assertion': token } : {} });

describe('Cloudflare Access sign-in', () => {
  const auth = cloudflareAccessAuth(TEAM, AUD);

  it('knows who signed in from the token Access adds', async () => {
    expect(await auth.viewer(request(await sign({ email: 'ana@example.com' })))).toEqual({ email: 'ana@example.com' });
  });

  it('treats requests that went around Access as not signed in', async () => {
    expect(await auth.viewer(request())).toBeNull();
    // the plain email header is easy to fake, so it's never trusted on its own
    expect(await auth.viewer(new Request('https://atlas.example/', { headers: { 'cf-access-authenticated-user-email': 'ana@example.com' } }))).toBeNull();
  });

  it('rejects forged, expired and other sites’ tokens', async () => {
    expect(await auth.viewer(request(await sign({ email: 'ana@example.com' }, { key: otherKey })))).toBeNull();
    expect(await auth.viewer(request(await sign({ email: 'ana@example.com' }, { expires: '-1m' })))).toBeNull();
    expect(await cloudflareAccessAuth(TEAM, 'another-app').viewer(request(await sign({ email: 'ana@example.com' })))).toBeNull();
    expect(await auth.viewer(request('not-a-token'))).toBeNull();
  });
});

describe('who may edit', () => {
  it('matches the EDITORS list, ignoring case and spaces', () => {
    const canEdit = editorList(' Ana@Example.com, bo@example.com ,');
    expect(canEdit({ email: 'ana@example.com' })).toBe(true);
    expect(canEdit({ email: 'BO@example.com' })).toBe(true);
    expect(canEdit({ email: 'grandma@example.com' })).toBe(false);
    expect(canEdit(null)).toBe(false);
    expect(editorList('')({ email: 'ana@example.com' })).toBe(false);
  });
});
