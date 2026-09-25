/**
 * Pose library: real body poses harvested from finished stills.
 *
 * The synthesized mannequins are hand-placed joints — readable but stiff. When Day Auto-review
 * keeps a still whose detected pose matched its guide well, the detected skeletons (DWPose on a
 * real rendered body) are saved under the guide's layout key. Later guides for the same layout
 * can draw one of those instead, so posing gets more natural the more you use it.
 *
 * Pure helpers plus a small browser-storage store; nothing here talks to ComfyUI.
 */

import type { OpenPosePerson } from '@/lib/pose-guide-openpose';

type Point = { x: number; y: number };

/** Normalized body keypoints (COCO-18, 0–1 of the image it came from); null = not detected. */
export type NormalizedBody = Array<Point | null>;

export type PoseLibraryEntry = {
  id: string;
  /** Layout key, e.g. `bent:2`, `lean_wall:1`, `sit:1` (see {@link poseLibraryKey}). */
  key: string;
  /** Source image width / height, so the pose is placed without stretching. */
  aspect: number;
  /** People in lead-first order. */
  people: NormalizedBody[];
  /** Pose-match score that earned it a place (0–1). */
  score: number;
  createdAt: number;
};

const STORAGE_KEY = 'castcut.poseLibrary.v1';
const CHANGE_EVENT = 'castcut-pose-library-changed';

function notifyChange(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // no window (tests / SSR)
  }
}

/** For `useSyncExternalStore`: re-read the count when the library changes. */
export function subscribePoseLibrary(onChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
const MAX_ENTRIES = 240;
const MAX_PER_KEY = 12;

/** Library key for a drawn guide: layout (sex / social / body base) plus headcount. */
export function poseLibraryKey(input: {
  intimate?: string | null;
  social?: string | null;
  base: string;
  people: number;
}): string {
  const layout = input.intimate || input.social || input.base;
  return `${layout}:${Math.max(1, Math.min(3, Math.round(input.people)))}`;
}

/** Enough torso and limbs to be worth reusing as a guide. */
export function bodyIsUsable(body: NormalizedBody): boolean {
  const core = [1, 2, 5, 8, 11].filter(index => body[index]).length;
  const limbs = [3, 4, 6, 7, 9, 10, 12, 13].filter(index => body[index]).length;
  return core >= 4 && limbs >= 5;
}

/**
 * Deterministic pick: most guides stay synthesized (stable, predictable), and roughly one in
 * three — plus every odd reroll — draws a harvested pose for this layout when one exists.
 */
export function pickPoseLibraryEntry(
  entries: PoseLibraryEntry[],
  key: string,
  seed: number,
  variant = 0
): PoseLibraryEntry | null {
  const matches = entries.filter(entry => entry.key === key);
  if (matches.length === 0) {
    return null;
  }
  const useLibrary = variant % 2 === 1 || (seed + variant) % 3 === 2;
  if (!useLibrary) {
    return null;
  }
  const ordered = [...matches].sort((a, b) => a.createdAt - b.createdAt);
  return ordered[(seed + variant) % ordered.length] ?? null;
}

/** Place a library pose onto a guide canvas (contain-fit, centered, no stretch). */
export function placeLibraryPeople(
  entry: PoseLibraryEntry,
  width: number,
  height: number
): OpenPosePerson[] {
  const aspect = entry.aspect > 0 ? entry.aspect : width / height;
  const fit = Math.min(width / aspect, height);
  const offX = (width - aspect * fit) / 2;
  const offY = (height - fit) / 2;
  return entry.people.map(body => ({
    body: body.map(p => (p ? { x: p.x * aspect * fit + offX, y: p.y * fit + offY } : null)),
  }));
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isEntry(value: unknown): value is PoseLibraryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as PoseLibraryEntry;
  return (
    typeof entry.id === 'string' &&
    typeof entry.key === 'string' &&
    typeof entry.aspect === 'number' &&
    Array.isArray(entry.people)
  );
}

export function loadPoseLibrary(): PoseLibraryEntry[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/**
 * Add a harvested pose, keeping the best {@link MAX_PER_KEY} per layout and the newest
 * {@link MAX_ENTRIES} overall. Pure: returns the next list.
 */
export function withPoseLibraryEntry(
  entries: PoseLibraryEntry[],
  entry: PoseLibraryEntry
): PoseLibraryEntry[] {
  const sameKey = [...entries.filter(e => e.key === entry.key), entry]
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, MAX_PER_KEY);
  const others = entries.filter(e => e.key !== entry.key);
  return [...others, ...sameKey].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ENTRIES);
}

export function savePoseLibraryEntry(entry: PoseLibraryEntry): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(withPoseLibraryEntry(loadPoseLibrary(), entry)));
    notifyChange();
  } catch {
    // Storage full or blocked — the library is a nicety, never a failure.
  }
}

export function clearPoseLibrary(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
    notifyChange();
  } catch {
    // ignore
  }
}

/** Raw stored library, as a stable `useSyncExternalStore` snapshot ('' when empty). */
export function poseLibrarySnapshot(): string {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function poseLibraryCount(): number {
  return loadPoseLibrary().length;
}
