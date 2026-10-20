const MISS_TTL_MS = 15 * 60 * 1000;
const MAX_MISSES = 2048;

const misses = new Map<string, number>();

export function modelPreviewCacheKey(input: {
  baseUrl: string;
  folder: string;
  pathIndex: number;
  filename: string;
}): string {
  return `${input.baseUrl.replace(/\/+$/, '')}|${input.folder}|${input.pathIndex}|${input.filename}`;
}

function pruneExpiredMisses(now: number): void {
  for (const [key, expiresAt] of misses) {
    if (expiresAt <= now) {
      misses.delete(key);
    }
  }
  while (misses.size > MAX_MISSES) {
    const oldest = misses.keys().next().value;
    if (typeof oldest !== 'string') {
      break;
    }
    misses.delete(oldest);
  }
}

export function hasCachedModelPreviewMiss(key: string, now = Date.now()): boolean {
  const expiresAt = misses.get(key);
  if (expiresAt == null) {
    return false;
  }
  if (expiresAt <= now) {
    misses.delete(key);
    return false;
  }
  return true;
}

export function rememberModelPreviewMiss(key: string, now = Date.now()): void {
  pruneExpiredMisses(now);
  misses.set(key, now + MISS_TTL_MS);
}

export function clearModelPreviewMiss(key: string): void {
  misses.delete(key);
}

export function resetModelPreviewMissCache(): void {
  misses.clear();
}

export const MODEL_PREVIEW_MISS_TTL_MS = MISS_TTL_MS;
