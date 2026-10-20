/**
 * Warm the browser (and view-proxy) cache for gallery mid-res lightbox URLs
 * before the lightbox mounts — hover/focus intent beats cold first open.
 */

// Bounds how many URLs we remember across a long-running session so this
// dedupe cache can't grow indefinitely as the user hovers/pages through a
// large gallery. A Set preserves insertion order, so once the cap is hit we
// evict the single oldest entry (least likely to still be relevant) before
// adding the new one -- cheap, and keeps memory flat instead of unbounded.
const PREFETCH_CACHE_LIMIT = 500;
const prefetchedUrls = new Set<string>();

export function prefetchGalleryImageUrl(url: string | null | undefined): void {
  const trimmed = url?.trim();
  if (!trimmed || typeof window === 'undefined') {
    return;
  }
  if (prefetchedUrls.has(trimmed)) {
    return;
  }
  if (prefetchedUrls.size >= PREFETCH_CACHE_LIMIT) {
    const oldest = prefetchedUrls.values().next().value;
    if (oldest !== undefined) {
      prefetchedUrls.delete(oldest);
    }
  }
  prefetchedUrls.add(trimmed);
  const img = new Image();
  img.decoding = 'async';
  img.src = trimmed;
}

export function prefetchGalleryImageUrls(urls: readonly string[]): void {
  for (const url of urls) {
    prefetchGalleryImageUrl(url);
  }
}
