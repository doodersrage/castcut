/**
 * "My poses": skeletons the player dragged into shape (or read from a photo) and saved by name,
 * reusable on any Day slot, Story beat or Outfit try-on. Synced like saved clothing
 * (studio-extras).
 */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/browser-storage';
import type { PhotoPose } from '@/lib/pose-types';

export const MY_POSES_STORAGE_KEY = 'comfy-my-poses-v1';
export const MY_POSES_CHANGED_EVENT = 'comfy-my-poses-changed';
export const MY_POSES_LIMIT = 40;

export type MyPose = {
  id: string;
  name: string;
  pose: PhotoPose;
  savedAt: number;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pose-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Number.isFinite((value as { x: unknown }).x) &&
    Number.isFinite((value as { y: unknown }).y)
  );
}

export function normalizeMyPose(raw: unknown): MyPose | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const pose = entry.pose as PhotoPose | undefined;
  const people = Array.isArray(pose?.people)
    ? pose!.people
        .filter(Array.isArray)
        .map(body => body.map(point => (isPoint(point) ? { x: point.x, y: point.y } : null)))
        .filter(body => body.some(Boolean))
    : [];
  if (people.length === 0 || people.length > 3) return null;
  const aspect = Number(pose?.aspect);
  const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'My pose';
  return {
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : newId(),
    name: name.slice(0, 60),
    pose: {
      aspect: Number.isFinite(aspect) && aspect > 0.2 && aspect < 5 ? aspect : 2 / 3,
      people,
      source: 'edited',
    },
    savedAt:
      typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt)
        ? entry.savedAt
        : Date.now(),
  };
}

export function loadMyPoses(): MyPose[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = readBrowserValue<unknown>(MY_POSES_STORAGE_KEY);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeMyPose)
      .filter((entry): entry is MyPose => Boolean(entry))
      .slice(0, MY_POSES_LIMIT);
  } catch {
    return [];
  }
}

function writeAll(entries: MyPose[]): MyPose[] {
  const next = entries.slice(0, MY_POSES_LIMIT);
  if (typeof window !== 'undefined') {
    try {
      writeBrowserValue(MY_POSES_STORAGE_KEY, next);
      window.dispatchEvent(new Event(MY_POSES_CHANGED_EVENT));
    } catch {
      /* quota / private mode */
    }
  }
  return next;
}

/** Save a pose under a name (newest first). */
export function saveMyPose(pose: PhotoPose, name: string): MyPose {
  const entry = normalizeMyPose({ pose, name, savedAt: Date.now() });
  if (!entry) throw new Error('That pose has no figure to save.');
  writeAll([entry, ...loadMyPoses()]);
  return entry;
}

export function removeMyPose(id: string): void {
  writeAll(loadMyPoses().filter(entry => entry.id !== id));
}

/** Server pull (studio-extras). */
export function replaceMyPoses(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  writeAll(entries.map(normalizeMyPose).filter((entry): entry is MyPose => Boolean(entry)));
}

export function subscribeMyPoses(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener(MY_POSES_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  return () => {
    window.removeEventListener(MY_POSES_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  };
}
