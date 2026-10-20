/**
 * Outbound URL checks for server-side fetch (SSRF hardening).
 * ComfyUI may live on LAN/loopback; webhooks default to public HTTPS/HTTP only.
 */

const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

export type SafeUrlOptions = {
  /** Allow RFC1918 / loopback / link-local hosts (needed for ComfyUI). Default false. */
  allowPrivate?: boolean;
  /** Restrict to these hostnames (case-insensitive). Empty = no host allowlist. */
  allowedHosts?: string[];
};

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map(part => {
    if (!/^\d{1,3}$/.test(part)) {
      return NaN;
    }
    return Number(part);
  });
  if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets;
}

function isPrivateOrLocalIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isMetadataIpv4(octets: number[]): boolean {
  // Cloud metadata link-local
  return octets[0] === 169 && octets[1] === 254;
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'host.docker.internal' ||
    host === 'docker.for.mac.localhost' ||
    host === 'docker.for.windows.localhost'
  ) {
    return true;
  }

  const ipv4 = parseIpv4(host);
  if (ipv4) {
    return isPrivateOrLocalIpv4(ipv4);
  }

  // IPv6 literals (URL hostname may be bare or without brackets after URL parsing)
  if (host.includes(':')) {
    if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true; // ULA
    if (host.startsWith('fe80')) return true; // link-local
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice('::ffff:'.length);
      const mappedIpv4 = parseIpv4(mapped);
      if (mappedIpv4) return isPrivateOrLocalIpv4(mappedIpv4);
    }
  }

  return false;
}

export function isBlockedMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (METADATA_HOSTS.has(host)) {
    return true;
  }
  const ipv4 = parseIpv4(host);
  if (ipv4 && isMetadataIpv4(ipv4)) {
    return true;
  }
  if (host.includes(':')) {
    // IPv6 link-local / unique-local often used in cloud metadata paths
    if (host.startsWith('fe80') || host === '::1') {
      return false; // handled by private policy; ::1 is loopback not metadata
    }
  }
  return false;
}

export function assertSafeHttpUrl(raw: string, options: SafeUrlOptions = {}): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('URL is required.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http: and https: URLs are allowed.');
  }

  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not allowed.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new Error('URL hostname is required.');
  }

  if (isBlockedMetadataHost(hostname)) {
    throw new Error('URL targets a blocked metadata endpoint.');
  }

  const allowPrivate = options.allowPrivate === true;
  if (!allowPrivate && isPrivateOrLocalHostname(hostname)) {
    throw new Error('Private or local network URLs are not allowed.');
  }

  // Always block cloud metadata IP even when private is allowed
  const ipv4 = parseIpv4(hostname);
  if (ipv4 && isMetadataIpv4(ipv4)) {
    throw new Error('URL targets a blocked metadata endpoint.');
  }

  const allowedHosts = options.allowedHosts
    ?.map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts && allowedHosts.length > 0) {
    const host = hostname.toLowerCase();
    if (!allowedHosts.includes(host)) {
      throw new Error('URL host is not in the allowlist.');
    }
  }

  return url;
}

export function normalizeSafeHttpUrl(raw: string, options: SafeUrlOptions = {}): string {
  return assertSafeHttpUrl(raw, options).toString().replace(/\/+$/, '');
}

export function getComfyUiAllowedHosts(): string[] | undefined {
  const raw = process.env.COMFYUI_ALLOWED_HOSTS?.trim();
  if (!raw) {
    return undefined;
  }
  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

/**
 * Whether a request may name its own ComfyUI address. Unset: only with login off (a local,
 * single-user install). With login on — a shared or exposed install — any signed-in user could
 * otherwise point the server at an internal host (security audit, 2026-10-11).
 */
export function isComfyClientUrlAllowed(): boolean {
  const raw = process.env.COMFYUI_ALLOW_CLIENT_URL?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') {
    return false;
  }
  if (raw === '1' || raw === 'true' || raw === 'yes') {
    return true;
  }
  const auth = process.env.PROMPT_AUTH_ENABLED?.trim().toLowerCase();
  return !(auth === '1' || auth === 'true' || auth === 'yes');
}

export function isWebhookPrivateAllowed(): boolean {
  const raw = process.env.WEBHOOK_ALLOW_PRIVATE?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function sanitizeComfyViewFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    throw new Error('filename is required.');
  }
  if (
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new Error('Invalid filename.');
  }
  return trimmed;
}

export function sanitizeComfyViewSubfolder(subfolder: string): string {
  const trimmed = subfolder.trim();
  if (!trimmed) {
    return '';
  }
  if (
    trimmed.includes('..') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0') ||
    trimmed.startsWith('/')
  ) {
    throw new Error('Invalid subfolder.');
  }
  return trimmed;
}

export function normalizeComfyViewType(type: string): 'output' | 'input' | 'temp' {
  if (type === 'output' || type === 'input' || type === 'temp') {
    return type;
  }
  throw new Error('type must be output, input, or temp.');
}
