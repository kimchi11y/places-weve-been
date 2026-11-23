import { describe, expect, it } from 'vitest';
import { tailscaleAuth } from '../src/server/auth/tailscale';
import { editorList } from '../src/server/auth/viewer';

const viewer = (...logins: string[]) => {
  const headers = new Headers();
  for (const login of logins) headers.append('tailscale-user-login', login);
  return tailscaleAuth.viewer(new Request('https://trips.example.ts.net/', { headers }));
};

describe('Tailscale sign-in', () => {
  it('knows who Serve says is visiting', async () => {
    expect(await viewer('ana@example.com')).toEqual({ email: 'ana@example.com' });
    expect(await viewer('ana@github')).toEqual({ email: 'ana@github' });
    expect(editorList('Ana@Example.com')(await viewer('ana@example.com'))).toBe(true);
  });

  it('refuses requests without a login, from Funnel or tagged devices', async () => {
    expect(await viewer()).toBeNull();
    for (const login of ['', ' ', 'tagged-devices', '@', 'ana@', '@example.com']) expect(await viewer(login)).toBeNull();
    // only the login counts, not the other headers
    expect(await tailscaleAuth.viewer(new Request('https://x.example/', { headers: { 'tailscale-user-name': 'ana@example.com', 'cf-access-authenticated-user-email': 'ana@example.com' } }))).toBeNull();
  });

  it('refuses more than one login', async () => {
    expect(await viewer('grandma@example.com', 'ana@example.com')).toBeNull();
    expect(await viewer('grandma@example.com,ana@example.com')).toBeNull();
    expect(await viewer('grandma@example.com ana@example.com')).toBeNull();
  });

  it('reads names outside ASCII', async () => {
    expect(await viewer('=?utf-8?q?b=C3=BC@example.com?=')).toEqual({ email: 'bü@example.com' });
    for (const bad of ['=?utf-8?q?=FF@example.com?=', '=?utf-8?q?a@example.com,b@example.com?=', '=?utf-8?q?a=2Cb@example.com?=', '=?utf-8?b?YUBiLmM=?=']) expect(await viewer(bad)).toBeNull();
  });
});
