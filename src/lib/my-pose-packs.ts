/**
 * "My packs": the player's own pose packs — a Day's slot poses saved by name and applied to any
 * Day later (day-pose-packs.ts). Stored like My poses and synced with them (studio-extras).
 */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/browser-storage';
import type { DaySlot } from '@/lib/day-planner';
import { normalizePosePack, posePackFromSlots, type PosePack } from '@/lib/day-pose-packs';

export const MY_POSE_PACKS_STORAGE_KEY = 'comfy-my-pose-packs-v1';
export const MY_POSE_PACKS_CHANGED_EVENT = 'comfy-my-pose-packs-changed';
export const MY_POSE_PACKS_LIMIT = 20;

function newId(): string {
  const tail =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `mine-${tail}`;
}

function normalizeMine(raw: unknown): PosePack | null {
  const pack = normalizePosePack(raw);
  return pack ? { ...pack, mine: true } : null;
}

export function loadMyPosePacks(): PosePack[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = readBrowserValue<unknown>(MY_POSE_PACKS_STORAGE_KEY);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeMine)
      .filter((pack): pack is PosePack => Boolean(pack))
      .slice(0, MY_POSE_PACKS_LIMIT);
  } catch {
    return [];
  }
}

function writeAll(packs: PosePack[]): PosePack[] {
  const next = packs.slice(0, MY_POSE_PACKS_LIMIT);
  if (typeof window !== 'undefined') {
    try {
      writeBrowserValue(MY_POSE_PACKS_STORAGE_KEY, next);
      window.dispatchEvent(new Event(MY_POSE_PACKS_CHANGED_EVENT));
    } catch {
      /* quota / private mode */
    }
  }
  return next;
}

/**
 * Save the Day's slot poses as a pack (newest first). A pack with the same name is replaced, so
 * saving "Gym day" again updates it instead of listing it twice.
 */
export function saveMyPosePack(slots: readonly DaySlot[], name: string): PosePack {
  const pack = posePackFromSlots(slots, name, newId());
  if (!pack) throw new Error('Pick a pose on at least one slot first.');
  const key = pack.name.toLowerCase();
  writeAll([pack, ...loadMyPosePacks().filter(entry => entry.name.toLowerCase() !== key)]);
  return pack;
}

export function removeMyPosePack(id: string): void {
  writeAll(loadMyPosePacks().filter(pack => pack.id !== id));
}

/** Server pull (studio-extras). */
export function replaceMyPosePacks(packs: unknown): void {
  if (!Array.isArray(packs)) return;
  writeAll(packs.map(normalizeMine).filter((pack): pack is PosePack => Boolean(pack)));
}

export function subscribeMyPosePacks(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener(MY_POSE_PACKS_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  return () => {
    window.removeEventListener(MY_POSE_PACKS_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  };
}
