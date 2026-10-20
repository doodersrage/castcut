const STORAGE_KEY = 'qwen-prompt-recent-locations';
const MAX_RECENT = 24;

export function normalizeLocationKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function loadRecentLocations(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function pushRecentLocation(location: string): string[] {
  const trimmed = location.trim();
  if (!trimmed || typeof window === 'undefined') {
    return loadRecentLocations();
  }

  const key = normalizeLocationKey(trimmed);
  const next = [
    trimmed,
    ...loadRecentLocations().filter(item => normalizeLocationKey(item) !== key),
  ].slice(0, MAX_RECENT);

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / privacy mode
  }

  return next;
}

export function readSceneLocationFromMetadata(
  metadata: Record<string, unknown> | undefined
): string | null {
  const value = metadata?.sceneLocation;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
