/**
 * "Chrome 149 on Linux" from a raw user-agent — the Profile sessions list showed the whole
 * "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36…" string for every device.
 */
export function userAgentLabel(userAgent: string | null | undefined): string {
  const ua = userAgent?.trim();
  if (!ua) {
    return 'Unknown device';
  }
  const browser =
    match(ua, /Edg(?:e|A|iOS)?\/(\d+)/, 'Edge') ??
    match(ua, /OPR\/(\d+)/, 'Opera') ??
    match(ua, /Firefox\/(\d+)/, 'Firefox') ??
    match(ua, /FxiOS\/(\d+)/, 'Firefox') ??
    match(ua, /HeadlessChrome\/(\d+)/, 'Headless Chrome') ??
    match(ua, /CriOS\/(\d+)/, 'Chrome') ??
    match(ua, /Chrome\/(\d+)/, 'Chrome') ??
    (/Safari\//.test(ua) ? (match(ua, /Version\/(\d+)/, 'Safari') ?? 'Safari') : null) ??
    (/^curl\//i.test(ua) ? 'curl' : null);
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? ua.slice(0, 60);
}

function match(ua: string, re: RegExp, name: string): string | null {
  const version = re.exec(ua)?.[1];
  return version ? `${name} ${version}` : null;
}
