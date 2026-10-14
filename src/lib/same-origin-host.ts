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
  /**
   * X-Forwarded-Host: the public name a reverse proxy was opened at. A browser page can't set it
   * (it isn't a CORS-safelisted header, and the preflight doesn't allow it), so an Origin that
   * matches it came through the proxy — PROMPT_TRUSTED_HOSTS isn't needed for that (2026-10-14).
   */
  forwardedHost?: string | null;
}): string[] {
  const origins = [input.serverOrigin];
  const forwarded = input.forwardedHost?.split(',')[0]?.trim().toLowerCase();
  if (forwarded) {
    const forwardedProto =
      (input.forwardedProto?.split(',')[0]?.trim().toLowerCase() ||
        input.protocol.replace(/:$/, '')) + ':';
    try {
      origins.push(new URL(`${forwardedProto}//${forwarded}`).origin);
    } catch {
      // Not a host name.
    }
  }
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

/**
 * Behind a reverse proxy the Host header is usually the upstream (127.0.0.1:47832) while the
 * browser's Origin is the public name (https://castcut.example.com), so the two never match — a
 * login through the proxy was refused (2026-10-11). An Origin whose hostname the operator listed
 * in PROMPT_TRUSTED_HOSTS is accepted whatever Host the proxy forwarded.
 */
export function isTrustedOriginHost(origin: string, trustedHosts?: string | null): boolean {
  const trusted = (trustedHosts ?? '')
    .split(',')
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
  if (!trusted.length) return false;
  try {
    return trusted.includes(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** 192.168.1.5, ::1 / [::1] — a literal address, never a name that DNS could rebind. */
export function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) {
    return bare.split('.').every(part => Number(part) <= 255);
  }
  return bare.includes(':') && /^[0-9a-f:.]+$/i.test(bare);
}
