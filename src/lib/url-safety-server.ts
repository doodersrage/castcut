import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { assertSafeHttpUrl, isBlockedMetadataHost, isPrivateOrLocalHostname } from './url-safety';

/**
 * A URL the server may fetch on a user's behalf: http(s), and every address its hostname resolves
 * to is public. assertSafeHttpUrl only reads the hostname as written, so a name that resolves to
 * 127.0.0.1 or 192.168.x.x passed and the server fetched the internal service (security audit,
 * 2026-10-11). `allowHosts` (exact hostnames, e.g. the configured ComfyUI) skip the check.
 */
export async function assertPublicFetchUrl(
  raw: string,
  options: { allowHosts?: string[] } = {}
): Promise<URL> {
  const url = assertSafeHttpUrl(raw, { allowPrivate: true });
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const allowed = (options.allowHosts ?? []).map(host => host.trim().toLowerCase());
  if (allowed.includes(hostname)) return url;
  const addresses = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true, verbatim: true })).map(entry => entry.address);
  if (!addresses.length) throw new Error('URL host does not resolve.');
  for (const address of addresses) {
    if (isBlockedMetadataHost(address) || isPrivateOrLocalHostname(address)) {
      throw new Error('URL resolves to a private or local address, which is not allowed.');
    }
  }
  return url;
}
