import { describe, expect, it } from 'vitest';
import { chooseAuth } from '../src/server/auth/choose';
import { tailscaleAuth } from '../src/server/auth/tailscale';

const access = { ACCESS_TEAM_DOMAIN: 'family.cloudflareaccess.com', ACCESS_AUD: 'aud' };

describe('choosing Tailscale', () => {
  it('only trusts it when nothing else can reach the site', () => {
    for (const HOST of [undefined, 'localhost', '127.0.0.1', '::1']) expect(chooseAuth({ AUTH: 'tailscale', HOST })).toBe(tailscaleAuth);
    for (const HOST of ['0.0.0.0', '::', '', '192.168.1.5', '100.64.0.1', 'example.com']) expect(chooseAuth({ AUTH: 'tailscale', HOST })).toBeNull();
  });
});

describe('choosing how people sign in', () => {
  it('uses Cloudflare Access once both its settings are there', () => {
    expect(chooseAuth({ AUTH: 'access', ...access })).not.toBeNull();
    expect(chooseAuth({ AUTH: 'access' })).toBeNull();
    expect(chooseAuth({ AUTH: 'access', ...access, ACCESS_AUD: '' })).toBeNull();
  });

  it('stays closed when it’s missing or misspelled', () => {
    for (const AUTH of [undefined, '', 'Access', 'acess', 'none', 'dev', 'constructor']) expect(chooseAuth({ AUTH, ...access })).toBeNull();
  });
});
