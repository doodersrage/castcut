/** Normalize location strings for dedupe / blocklist matching. */
export function normalizeLocationKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function mergeLocationExclusions(
  recent?: readonly string[],
  blocked?: readonly string[]
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const location of [...(recent ?? []), ...(blocked ?? [])]) {
    const trimmed = location.trim();
    if (!trimmed) {
      continue;
    }

    const key = normalizeLocationKey(trimmed);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(trimmed);
  }

  return merged;
}

export function locationIsBlocked(
  location: string,
  blocked: readonly string[] | undefined
): boolean {
  if (!blocked?.length) {
    return false;
  }

  const key = normalizeLocationKey(location);
  return blocked.some(item => normalizeLocationKey(item) === key);
}
