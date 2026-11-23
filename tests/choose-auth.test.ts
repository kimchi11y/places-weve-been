import { describe, expect, it } from 'vitest';
import { chooseAuth } from '../src/server/auth/choose';

const access = { ACCESS_TEAM_DOMAIN: 'family.cloudflareaccess.com', ACCESS_AUD: 'aud' };

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
