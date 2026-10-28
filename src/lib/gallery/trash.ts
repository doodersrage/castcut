/**
 * The trash (M10 T2, ROADMAP principle 6: destructive actions recoverable): a deleted Gallery entry
 * or a take removed from a Scene waits here for {@link TRASH_DAYS} days, and **Restore** puts it
 * back. A confirm click used to be the only guard.
 *
 * Kept in browser storage and synced in studio-extras as `trash` (a record list: per item, newest
 * wins, removals kept). Each item carries links to its kept media (`/api/gallery/media/<id>`): the
 * server's media cleanup keeps a copy any stored row links to, so the files stay while the item is
 * here. A restored item comes back under a new id — the old one's deletion (a synced tombstone)
 * stays, so no device deletes it again; a Gallery entry's kept media is copied to the new id
 * (trash-restore.ts). Pure but for storage.
 */
import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/storage/browser-storage';
import { recordListSpec } from '../storage/record-list-sync';
import { trackRecordListWrite } from '../storage/record-tombstones';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export const TRASH_STORAGE_KEY = 'castcut-trash-v1';
export const TRASH_CHANGED_EVENT = 'castcut-trash-changed';
export const TRASH_DAYS = 14;
export const TRASH_LIMIT = 200;
/** A Gallery entry's graph is kept up to this size; a bigger one is left to ComfyUI's history. */
const TRASH_GRAPH_MAX = 48_000;
const DAY_MS = 86_400_000;

export type TrashItem = {
  id: string;
  kind: 'gallery-entry' | 'scene-take';
  /** When it was put here. */
  at: number;
  label: string;
  thumbUrl?: string;
  /** A Gallery entry (its graph kept when small; the search corpus left out). */
  entry?: ComfyGalleryEntry;
  /** A take, the Scene it was removed from, where it stood and whether it was the kept one. */
  take?: Record<string, unknown> & { id: string };
  sceneId?: string;
  index?: number;
  wasKept?: boolean;
  castId?: string;
  /** Links to its kept media, so the server keeps the files while it is here. */
  links: string[];
  updatedAt?: number;
};

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export function newTrashId(now = Date.now()): string {
  return `trash-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A stored item, tidied; null when it isn't one or its days are up. */
export function normalizeTrashItem(raw: unknown, now = Date.now()): TrashItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const id = text(item.id, 80);
  const kind = item.kind === 'gallery-entry' || item.kind === 'scene-take' ? item.kind : null;
  const at = typeof item.at === 'number' && Number.isFinite(item.at) ? item.at : 0;
  if (!id || !kind || !at || now - at > TRASH_DAYS * DAY_MS) return null;
  const entry =
    kind === 'gallery-entry' && item.entry && typeof item.entry === 'object'
      ? (item.entry as ComfyGalleryEntry)
      : undefined;
  const take =
    kind === 'scene-take' &&
    item.take &&
    typeof item.take === 'object' &&
    typeof (item.take as { id?: unknown }).id === 'string'
      ? (item.take as TrashItem['take'])
      : undefined;
  if (kind === 'gallery-entry' && !entry?.id) return null;
  if (kind === 'scene-take' && (!take || !text(item.sceneId, 80))) return null;
  const thumbUrl = text(item.thumbUrl, 600);
  return {
    id,
    kind,
    at,
    label: text(item.label, 160) || (kind === 'scene-take' ? 'A take' : 'A Gallery entry'),
    ...(thumbUrl ? { thumbUrl } : {}),
    ...(entry ? { entry } : {}),
    ...(take ? { take, sceneId: text(item.sceneId, 80) } : {}),
    ...(take && typeof item.index === 'number' && item.index >= 0 ? { index: item.index } : {}),
    ...(take && item.wasKept === true ? { wasKept: true } : {}),
    ...(text(item.castId, 120) ? { castId: text(item.castId, 120) } : {}),
    links: (Array.isArray(item.links) ? item.links : [])
      .map(link => text(link, 300))
      .filter(Boolean)
      .slice(0, 8),
    ...(typeof item.updatedAt === 'number' ? { updatedAt: item.updatedAt } : {}),
  };
}

export function normalizeTrash(raw: unknown, now = Date.now()): TrashItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TrashItem[] = [];
  for (const entry of raw) {
    const item = normalizeTrashItem(entry, now);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, TRASH_LIMIT);
}

/** What the trash keeps of a Gallery entry: all of it but the search corpus and a large graph. */
export function galleryEntryTrashItem(
  entry: ComfyGalleryEntry,
  input: { thumbUrl?: string; now?: number } = {}
): TrashItem {
  const now = input.now ?? Date.now();
  const kept: ComfyGalleryEntry & { _corpus?: string } = { ...entry };
  delete kept._corpus;
  if (kept.workflowJson && kept.workflowJson.length > TRASH_GRAPH_MAX) {
    delete kept.workflowJson;
    delete kept.hasStoredWorkflow;
  }
  return {
    id: newTrashId(now),
    kind: 'gallery-entry',
    at: now,
    label: entry.prompt?.trim().slice(0, 160) || 'A Gallery entry',
    ...(input.thumbUrl ? { thumbUrl: input.thumbUrl } : {}),
    entry: kept as ComfyGalleryEntry,
    links: [`/api/gallery/media/${entry.id}`],
  };
}

/** The entry as restored: a new id, and every mention of the old one moved to it. */
export function restoredGalleryEntry(entry: ComfyGalleryEntry, newId: string): ComfyGalleryEntry {
  const json = JSON.stringify(entry).split(entry.id).join(newId);
  return { ...(JSON.parse(json) as ComfyGalleryEntry), id: newId };
}

/** A take removed from a Scene, as the trash keeps it. */
export function sceneTakeTrashItem(input: {
  take: Record<string, unknown> & { id: string; imageUrl?: string };
  sceneId: string;
  sceneName: string;
  index: number;
  wasKept: boolean;
  castId?: string;
  now?: number;
}): TrashItem {
  const now = input.now ?? Date.now();
  return {
    id: newTrashId(now),
    kind: 'scene-take',
    at: now,
    label: `A take of ${input.sceneName}`,
    ...(typeof input.take.imageUrl === 'string' ? { thumbUrl: input.take.imageUrl } : {}),
    take: input.take,
    sceneId: input.sceneId,
    index: input.index,
    ...(input.wasKept ? { wasKept: true } : {}),
    ...(input.castId ? { castId: input.castId } : {}),
    // The take's picture is its Gallery entry's (the take stays in the Gallery).
    links: [],
  };
}

export function loadTrash(now = Date.now()): TrashItem[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeTrash(readBrowserValue<unknown>(TRASH_STORAGE_KEY), now);
  } catch {
    return [];
  }
}

function writeAll(items: TrashItem[], options: { fromSync?: boolean } = {}): void {
  const limited = items.slice(0, TRASH_LIMIT);
  const next = options.fromSync
    ? limited
    : trackRecordListWrite(recordListSpec('trash'), loadTrash(), limited);
  if (typeof window === 'undefined') return;
  try {
    writeBrowserValue(TRASH_STORAGE_KEY, next);
    window.dispatchEvent(new Event(TRASH_CHANGED_EVENT));
  } catch {
    /* quota / private mode */
  }
}

export function addToTrash(items: readonly TrashItem[]): void {
  if (!items.length) return;
  writeAll([...items, ...loadTrash()]);
}

/** Take an item out (restored, or deleted for good); the item, if it was there. */
export function takeFromTrash(id: string): TrashItem | undefined {
  const all = loadTrash();
  const item = all.find(entry => entry.id === id);
  if (item) writeAll(all.filter(entry => entry.id !== id));
  return item;
}

/** A Scene's removed takes, newest first. */
export function trashedTakesOf(items: readonly TrashItem[], sceneId: string): TrashItem[] {
  return items.filter(item => item.kind === 'scene-take' && item.sceneId === sceneId);
}

export function emptyTrash(): void {
  if (loadTrash().length) writeAll([]);
}

/** Server pull (studio-extras). */
export function replaceTrash(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  writeAll(normalizeTrash(entries), { fromSync: true });
}

export function subscribeTrash(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener(TRASH_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  return () => {
    window.removeEventListener(TRASH_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  };
}
