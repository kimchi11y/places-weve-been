/**
 * Signed in through Cloudflare Access. Access sends every request it lets through with a
 * signed token (the Cf-Access-Jwt-Assertion header); checking that signature, rather than
 * trusting the plain email header, means a request that went around Access (for example to
 * the Worker's own workers.dev address) is never taken as signed in.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Auth } from './viewer';

/**
 * teamDomain: "yourteam.cloudflareaccess.com" (Zero Trust → Settings → Team domain)
 * audience: the application's "Application Audience (AUD) Tag" (Access → Applications → the app → Overview)
 */
export function cloudflareAccessAuth(teamDomain: string, audience: string): Auth {
  const issuer = `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  return {
    async viewer(request) {
      const token = request.headers.get('cf-access-jwt-assertion');
      if (!token) return null;
      try {
        const { payload } = await jwtVerify(token, keys, { issuer, audience });
        return typeof payload.email === 'string' ? { email: payload.email } : null;
      } catch {
        return null;
      }
    },
  };
}
