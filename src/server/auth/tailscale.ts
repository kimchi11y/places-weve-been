/**
 * Signed in through Tailscale Serve, which tells the site who's visiting in the
 * Tailscale-User-Login header and removes any copy a visitor sends. That only holds for
 * requests that came through Serve, so nothing else may be able to reach the site:
 * choose.ts refuses unless it listens on this computer alone.
 */
import type { Auth } from './viewer';

/** Names outside ASCII may arrive as "=?utf-8?q?b=C3=BC@example.com?=" (RFC 2047). */
function decode(value: string) {
  const encoded = value.match(/^=\?utf-8\?q\?([^?]*)\?=$/i)?.[1];
  if (encoded === undefined) return value;
  const bytes = encoded.replace(/_/g, ' ').replace(/%/g, '%25').replace(/=([0-9a-f]{2})/gi, '%$1');
  try {
    return decodeURIComponent(bytes);
  } catch {
    return '';
  }
}

export const tailscaleAuth: Auth = {
  async viewer(request) {
    // Absent for strangers coming through Funnel, and for tagged devices, which belong to nobody
    const login = decode(request.headers.get('tailscale-user-login') ?? '');
    // Two headers are joined with a comma; exactly one login is ever right
    return /^[^\s,@]+@[^\s,@]+$/.test(login) ? { email: login } : null;
  },
};
