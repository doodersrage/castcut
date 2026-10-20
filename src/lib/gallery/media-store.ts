import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { resolvePromptDataDir } from '../prompt-data-paths';
import { isServerStorageEnabled } from '../server-storage';

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;
// "." and ".." are otherwise valid under SAFE_ID's character class, and both are
// real path segments (path.join(dataRoot(), 'gallery-media', owner, '..') walks up
// a directory), so they must be rejected explicitly rather than relying on the
// character-class alone.
const DOT_SEGMENTS = new Set(['.', '..']);

/** Bound on per-entry image index — generous for any realistic batch, cheap to validate. */
const MAX_MEDIA_INDEX = 63;

export type DurableMediaFile = {
  buffer: Buffer;
  contentType: string;
};

function isSafeId(value: string): boolean {
  return SAFE_ID.test(value) && !DOT_SEGMENTS.has(value);
}

function mediaOwner(userId?: string | null): string {
  const raw = userId?.trim() || '_global';
  return isSafeId(raw) ? raw : '_global';
}

function assertSafeId(id: string, label: string): string {
  const trimmed = id.trim();
  if (!isSafeId(trimmed)) {
    throw new Error(`Invalid ${label}.`);
  }
  return trimmed;
}

/** Normalizes an optional per-entry image index — defaults to 0 (the primary output). */
function safeIndex(index?: number | null): number {
  if (index == null) {
    return 0;
  }
  if (!Number.isInteger(index) || index < 0 || index > MAX_MEDIA_INDEX) {
    throw new Error(`Invalid media index.`);
  }
  return index;
}

function dataRoot(): string {
  return resolvePromptDataDir();
}

function thumbDir(owner: string, entryId: string): string {
  return path.join(/* turbopackIgnore: true */ dataRoot(), 'gallery-media', owner, entryId);
}

function identityDir(owner: string): string {
  return path.join(/* turbopackIgnore: true */ dataRoot(), 'identity', owner);
}

/**
 * Filenames for index 0 stay the original flat names (`thumb.webp`,
 * `original`, `original.meta.json`) so existing single-image entries need no
 * migration. Index 1+ (multi-image batches) get an `-{index}` suffix in the
 * same entry directory.
 */
function thumbFileName(index: number): string {
  return index === 0 ? 'thumb.webp' : `thumb-${index}.webp`;
}
function originalFileName(index: number): string {
  return index === 0 ? 'original' : `original-${index}`;
}
function originalMetaFileName(index: number): string {
  return index === 0 ? 'original.meta.json' : `original-${index}.meta.json`;
}

export function durableThumbRelativePath(owner: string, entryId: string, index?: number): string {
  return `gallery-media/${owner}/${entryId}/${thumbFileName(safeIndex(index))}`;
}

export function persistGalleryOriginalFile(input: {
  userId?: string | null;
  entryId: string;
  index?: number;
  buffer: Buffer;
  contentType?: string;
  filename?: string;
}): { relativePath: string } {
  if (!isServerStorageEnabled()) {
    throw new Error('Server storage is disabled.');
  }
  const owner = mediaOwner(input.userId);
  const entryId = assertSafeId(input.entryId, 'gallery id');
  const index = safeIndex(input.index);
  const dir = thumbDir(owner, entryId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, originalFileName(index)), input.buffer);
  fs.writeFileSync(
    path.join(dir, originalMetaFileName(index)),
    JSON.stringify({
      contentType: input.contentType?.trim() || 'application/octet-stream',
      filename: input.filename?.trim() || 'upload.png',
    })
  );
  return { relativePath: `gallery-media/${owner}/${entryId}/${originalFileName(index)}` };
}

export function readGalleryOriginalFile(input: {
  userId?: string | null;
  entryId: string;
  index?: number;
}): (DurableMediaFile & { filename?: string }) | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  const owner = mediaOwner(input.userId);
  const entryId = assertSafeId(input.entryId, 'gallery id');
  const index = safeIndex(input.index);
  const dir = thumbDir(owner, entryId);
  const filePath = path.join(dir, originalFileName(index));
  if (!fs.existsSync(filePath)) {
    return null;
  }
  let contentType = 'application/octet-stream';
  let filename: string | undefined;
  try {
    const metaRaw = fs.readFileSync(path.join(dir, originalMetaFileName(index)), 'utf8');
    const meta = JSON.parse(metaRaw) as { contentType?: string; filename?: string };
    if (typeof meta.contentType === 'string' && meta.contentType.trim()) {
      contentType = meta.contentType.trim();
    }
    if (typeof meta.filename === 'string' && meta.filename.trim()) {
      filename = meta.filename.trim();
    }
  } catch {
    // Missing meta is fine — serve as octet-stream.
  }
  return {
    buffer: fs.readFileSync(filePath),
    contentType,
    filename,
  };
}

export function persistGalleryThumbFile(input: {
  userId?: string | null;
  entryId: string;
  index?: number;
  buffer: Buffer;
}): { relativePath: string } {
  if (!isServerStorageEnabled()) {
    throw new Error('Server storage is disabled.');
  }
  const owner = mediaOwner(input.userId);
  const entryId = assertSafeId(input.entryId, 'gallery id');
  const index = safeIndex(input.index);
  const dir = thumbDir(owner, entryId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, thumbFileName(index));
  fs.writeFileSync(filePath, input.buffer);
  return { relativePath: durableThumbRelativePath(owner, entryId, index) };
}

export function readGalleryThumbFile(input: {
  userId?: string | null;
  entryId: string;
  index?: number;
}): DurableMediaFile | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  const owner = mediaOwner(input.userId);
  const entryId = assertSafeId(input.entryId, 'gallery id');
  const index = safeIndex(input.index);
  const filePath = path.join(thumbDir(owner, entryId), thumbFileName(index));
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return {
    buffer: fs.readFileSync(filePath),
    contentType: 'image/webp',
  };
}

export function persistIdentityFile(input: {
  userId?: string | null;
  buffer: Buffer;
  contentType?: string;
  filename?: string;
}): { relativePath: string } {
  if (!isServerStorageEnabled()) {
    throw new Error('Server storage is disabled.');
  }
  const owner = mediaOwner(input.userId);
  const dir = identityDir(owner);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'lock');
  fs.writeFileSync(filePath, input.buffer);
  const meta = {
    contentType: input.contentType?.trim() || 'application/octet-stream',
    filename: input.filename?.trim() || 'identity.png',
  };
  fs.writeFileSync(path.join(dir, 'lock.meta.json'), JSON.stringify(meta));
  return { relativePath: `identity/${owner}/lock` };
}

export function readIdentityFile(input: { userId?: string | null }): DurableMediaFile | null {
  if (!isServerStorageEnabled()) {
    return null;
  }
  const owner = mediaOwner(input.userId);
  const filePath = path.join(identityDir(owner), 'lock');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  let contentType = 'application/octet-stream';
  try {
    const metaRaw = fs.readFileSync(path.join(identityDir(owner), 'lock.meta.json'), 'utf8');
    const meta = JSON.parse(metaRaw) as { contentType?: string };
    if (typeof meta.contentType === 'string' && meta.contentType.trim()) {
      contentType = meta.contentType.trim();
    }
  } catch {
    // Missing meta is fine — serve as octet-stream.
  }
  return {
    buffer: fs.readFileSync(filePath),
    contentType,
  };
}
