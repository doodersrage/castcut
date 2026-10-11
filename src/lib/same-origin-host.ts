/**
 * Which origins count as "this app" for a browser request. The production server reports its own
 * origin as the address it was started on (http://localhost:47832), so a page opened at the
 * machine's LAN address (http://192.168.12.43:47832) or at 127.0.0.1 failed the same-origin check
 * and every API call was refused — the app said ComfyUI wasn't reachable (2026-10-11).
 *
 * The Host header the browser sent is accepted too, but only when it can't be a DNS-rebinding
 * name: an IP address, `localhost`, or a hostname listed in PROMPT_TRUSTED_HOSTS.
 */
export function acceptedRequestOrigins(input: {
  /** request.nextUrl.origin */
  serverOrigin: string;
  /** The Host header. */
  host: string | null;
  /** request.nextUrl.protocol ("http:" / "https:"); X-Forwarded-Proto wins when present. */
  protocol: string;
  forwardedProto?: string | null;
  /** PROMPT_TRUSTED_HOSTS, comma-separated hostnames (no ports). */
  trustedHosts?: string | null;
}): string[] {
  const origins = [input.serverOrigin];
  const host = input.host?.trim().toLowerCase();
  if (!host) return origins;
  const proto =
    (input.forwardedProto?.split(',')[0]?.trim().toLowerCase() ||
      input.protocol.replace(/:$/, '')) + ':';
  let hostname: string;
  try {
    hostname = new URL(`${proto}//${host}`).hostname;
  } catch {
    return origins;
  }
  const trusted = (input.trustedHosts ?? '')
    .split(',')
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
  if (isIpLiteral(hostname) || hostname === 'localhost' || trusted.includes(hostname)) {
    origins.push(new URL(`${proto}//${host}`).origin);
  }
  return origins;
}

/** 192.168.1.5, ::1 / [::1] — a literal address, never a name that DNS could rebind. */
export function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) {
    return bare.split('.').every(part => Number(part) <= 255);
  }
  return bare.includes(':') && /^[0-9a-f:.]+$/i.test(bare);
}
