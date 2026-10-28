import 'server-only';

/**
 * The Gallery's kept copies (gallery-media/<owner>/<entry id>/) outlived their entries: delete,
 * Purge and Archive & purge removed the entry but never its files, so the folder only grew.
 * Deleting entries now removes their copies; the leftovers from before are listed and removed
 * here on request.
 *
 * A copy is kept while it is in use: its entry is still in a Gallery, or something saved links
 * to it (a Day / Story still or Cast plate showing `/api/gallery/media/<id>`) — on the server
 * (every account's stored rows) or in the browser asking. Every link to a copy is built from one
 * of those two, so an id merely mentioned (prompt history) does not keep it. Only entry-id folders are touched: Cast
 * plate copies (`cast-plate-char-…`) live in the same folder and are never removed here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptDataDir } from '../prompt/data-paths';

const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A link or path to a kept copy: `/api/gallery/media/<id>…` or `gallery-media/<owner>/<id>`. */
const MEDIA_LINK =
  /gallery[/-]media\/(?:[A-Za-z0-9._-]+\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;
const SAFE_OWNER = /^[A-Za-z0-9._-]{1,128}$/;

/** Leftovers newer than this stay: a render waiting on its adult check has no server entry yet. */
export const GALLERY_MEDIA_LEFTOVER_MIN_AGE_DAYS = 7;

function mediaOwnerDir(userId?: string | null): string {
  const raw = userId?.trim() || '_global';
  const owner = SAFE_OWNER.test(raw) && raw !== '.' && raw !== '..' ? raw : '_global';
  return path.join(/* turbopackIgnore: true */ resolvePromptDataDir(), 'gallery-media', owner);
}

/** Entry ids whose kept copy the text links to. */
export function galleryMediaLinksInText(text: string, into = new Set<string>()): Set<string> {
  for (const match of text.matchAll(MEDIA_LINK)) into.add(match[1]!);
  return into;
}

/** Every Gallery entry on the server (any account), plus every kept copy a saved row links to. */
async function idsInUseOnServer(): Promise<Set<string>> {
  const [{ forEachStoredJsonText }, { getStudioDb }] = await Promise.all([
    import('../sqlite/stored-json-scan'),
    import('../sqlite/studio-db'),
  ]);
  const ids = new Set<string>();
  for (const row of getStudioDb().prepare('SELECT id FROM gallery_entries').iterate() as Iterable<{
    id?: unknown;
  }>) {
    if (typeof row.id === 'string') ids.add(row.id);
  }
  forEachStoredJsonText(text => galleryMediaLinksInText(text, ids));
  return ids;
}

function folderStats(dir: string): { bytes: number; newestMs: number } {
  let bytes = 0;
  let newestMs = 0;
  for (const name of fs.readdirSync(dir)) {
    try {
      const stat = fs.statSync(path.join(dir, name));
      bytes += stat.size;
      newestMs = Math.max(newestMs, stat.mtimeMs);
    } catch {
      // vanished
    }
  }
  return { bytes, newestMs };
}

export type GalleryMediaLeftovers = {
  removable: string[];
  removableBytes: number;
  keptInUse: number;
  keptRecent: number;
  keptBytes: number;
  minAgeDays: number;
};

export async function scanGalleryMediaLeftovers(input: {
  userId?: string | null;
  browserIds?: Iterable<string>;
  now?: number;
}): Promise<GalleryMediaLeftovers> {
  const root = mediaOwnerDir(input.userId);
  const named = await idsInUseOnServer();
  for (const id of input.browserIds ?? []) named.add(id);
  const cutoff = (input.now ?? Date.now()) - GALLERY_MEDIA_LEFTOVER_MIN_AGE_DAYS * 86_400_000;
  const result: GalleryMediaLeftovers = {
    removable: [],
    removableBytes: 0,
    keptInUse: 0,
    keptRecent: 0,
    keptBytes: 0,
    minAgeDays: GALLERY_MEDIA_LEFTOVER_MIN_AGE_DAYS,
  };
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return result;
  }
  for (const name of names) {
    if (!ENTRY_ID.test(name)) continue;
    const dir = path.join(root, name);
    let stats: { bytes: number; newestMs: number };
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      stats = folderStats(dir);
    } catch {
      continue;
    }
    if (named.has(name)) {
      result.keptInUse += 1;
      result.keptBytes += stats.bytes;
    } else if (stats.newestMs > cutoff) {
      result.keptRecent += 1;
      result.keptBytes += stats.bytes;
    } else {
      result.removable.push(name);
      result.removableBytes += stats.bytes;
    }
  }
  return result;
}

function removeFolders(
  root: string,
  ids: Iterable<string>
): { removed: number; freedBytes: number } {
  let removed = 0;
  let freedBytes = 0;
  for (const id of ids) {
    if (!ENTRY_ID.test(id)) continue;
    const dir = path.join(root, id);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      freedBytes += folderStats(dir).bytes;
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    } catch {
      // already gone
    }
  }
  return { removed, freedBytes };
}

/** Remove the leftovers asked for that a fresh scan still offers. */
export async function removeGalleryMediaLeftovers(input: {
  userId?: string | null;
  browserIds?: Iterable<string>;
  ids: Iterable<string>;
}): Promise<{ removed: number; freedBytes: number }> {
  const scan = await scanGalleryMediaLeftovers(input);
  const offered = new Set(scan.removable);
  return removeFolders(
    mediaOwnerDir(input.userId),
    [...input.ids].filter(id => offered.has(id))
  );
}

/**
 * Entries just deleted from the Gallery: remove their copies, unless something on the server
 * still links to them (a Day still showing one, say). No age rule — the player deleted them.
 */
export async function removeDeletedGalleryEntryMedia(input: {
  userId?: string | null;
  ids: Iterable<string>;
}): Promise<{ removed: number; freedBytes: number }> {
  const named = await idsInUseOnServer();
  return removeFolders(
    mediaOwnerDir(input.userId),
    [...input.ids].filter(id => !named.has(id))
  );
}

/**
 * A Gallery entry restored from the trash (M10 T2) comes back under a new id: copy its kept media
 * to that id's folder. The old folder stays until nothing links to it. False: nothing to copy.
 */
export function copyGalleryEntryMedia(input: {
  userId?: string | null;
  from: string;
  to: string;
}): boolean {
  if (!ENTRY_ID.test(input.from) || !ENTRY_ID.test(input.to) || input.from === input.to) {
    return false;
  }
  const root = mediaOwnerDir(input.userId);
  const from = path.join(root, input.from);
  const to = path.join(root, input.to);
  try {
    if (!fs.statSync(from).isDirectory() || fs.existsSync(to)) return false;
    fs.cpSync(from, to, { recursive: true, errorOnExist: true });
    return true;
  } catch {
    return false;
  }
}
