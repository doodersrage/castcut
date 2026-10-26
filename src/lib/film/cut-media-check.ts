/**
 * Does a shot's file still answer? (M4 F3) A GET for one byte, abandoned as soon as the headers
 * arrive — route handlers here define GET, not HEAD — so checking a film costs a request per
 * file, not a download. 404 / 410 is missing; anything else that fails (offline, another site's
 * CORS) is unknown, never reported as missing. Results are remembered for the page.
 */
import type { MediaUrlStatus } from './cut-missing';

const checked = new Map<string, MediaUrlStatus>();
const CHECK_TIMEOUT_MS = 8_000;
const CONCURRENCY = 4;

export async function checkMediaUrl(
  url: string,
  fetcher: typeof fetch = fetch
): Promise<MediaUrlStatus> {
  if (!url.trim() || url.startsWith('data:') || url.startsWith('blob:')) return 'ok';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
      cache: 'no-store',
    });
    controller.abort();
    if (response.ok) return 'ok';
    return response.status === 404 || response.status === 410 ? 'missing' : 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

/** Every URL's status (a few at a time); `fresh` checks again instead of using what is known. */
export async function checkMediaUrls(
  urls: readonly string[],
  options: { fresh?: boolean; fetcher?: typeof fetch } = {}
): Promise<Map<string, MediaUrlStatus>> {
  const todo = [...new Set(urls.filter(Boolean))].filter(url => options.fresh || !checked.has(url));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++]!;
      checked.set(url, await checkMediaUrl(url, options.fetcher));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  return new Map(urls.map(url => [url, checked.get(url) ?? 'unknown']));
}
