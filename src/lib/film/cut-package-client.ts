/**
 * Build and import a Cut package in the browser (M4 F7, cut-package.ts). A full package fetches
 * each medium the cut plays, hashes it (SHA-256) and puts it in the .zip; importing keeps a URL
 * that still answers, reuses a file stored here before under its hash, and otherwise stores the
 * packaged file in this Gallery and relinks the cut to it. What can't be found is said, and shows
 * in Cut's Missing media (cut-missing.ts). Network and storage are passed in (tests).
 */
import { buildZipBlob, type ZipFileEntry } from '../gallery/zip-core';
import { persistGalleryOriginal } from '../gallery/media-client';
import { readZipBinaryEntries } from '../storage/zip-read';
import { checkMediaUrl } from './cut-media-check';
import {
  CUT_PACKAGE_FORMAT,
  CUT_PACKAGE_MANIFEST,
  CUT_PACKAGE_VERSION,
  cutMediaUrls,
  packageMediaEntryId,
  parseCutPackageManifest,
  rewriteCutMedia,
  type CutPackageManifest,
  type CutPackageMedia,
} from './cut-package';
import type { MediaUrlStatus } from './cut-missing';

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
};

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function extensionOf(url: string, contentType: string): string {
  const fromType = EXT_BY_TYPE[contentType.split(';')[0]!.trim().toLowerCase()];
  if (fromType) return fromType;
  const match = url.split(/[?#]/)[0]!.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1]!.toLowerCase() : 'bin';
}

export async function buildCutPackage(input: {
  cut: CutPackageManifest['cut'];
  name: string;
  castName?: string;
  full: boolean;
  fetcher?: typeof fetch;
  now?: number;
}): Promise<{ blob: Blob; media: number; packed: number; unreadable: string[] }> {
  const fetcher = input.fetcher ?? fetch;
  const urls = cutMediaUrls(input.cut);
  const files: ZipFileEntry[] = [];
  const media: CutPackageMedia[] = [];
  const unreadable: string[] = [];
  const packedBySha = new Set<string>();
  for (const url of urls) {
    if (!input.full) {
      media.push({ url });
      continue;
    }
    try {
      const response = await fetcher(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(String(response.status));
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') ?? '';
      const sha256 = await sha256Hex(bytes);
      const file = `media/${sha256}.${extensionOf(url, contentType)}`;
      if (!packedBySha.has(sha256)) {
        packedBySha.add(sha256);
        files.push({ filename: file, data: bytes });
      }
      media.push({
        url,
        file,
        sha256,
        bytes: bytes.byteLength,
        ...(contentType ? { contentType: contentType.split(';')[0]!.trim() } : {}),
      });
    } catch {
      unreadable.push(url);
      media.push({ url });
    }
  }
  const manifest: CutPackageManifest = {
    format: CUT_PACKAGE_FORMAT,
    version: CUT_PACKAGE_VERSION,
    createdAt: input.now ?? Date.now(),
    name: input.name.trim().slice(0, 60) || 'Cut',
    ...(input.castName ? { castName: input.castName } : {}),
    kind: input.full ? 'full' : 'light',
    cut: input.cut,
    media,
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const readme = new TextEncoder().encode(
    [
      `${manifest.name} — a Castcut cut package (format ${CUT_PACKAGE_VERSION}, ${manifest.kind}).`,
      '',
      'Import it in Castcut: Cut → Versions → Import a package. It comes in as a version.',
      input.full
        ? 'The media are in media/ by their SHA-256; a file already there is reused.'
        : 'A light package has no media: the cut points at the same addresses, so import it where those files are.',
      '',
    ].join('\n')
  );
  return {
    blob: buildZipBlob([
      { filename: CUT_PACKAGE_MANIFEST, data: manifestBytes },
      { filename: 'README.txt', data: readme },
      ...files,
    ]),
    media: media.length,
    packed: files.length,
    unreadable,
  };
}

/**
 * Without server storage (no data folder set), a small file is kept in the cut itself as a data
 * URL — as a music bed upload is — up to these sizes; anything larger is listed as not found.
 */
export const PACKAGE_INLINE_FILE_MAX = 2 * 1024 * 1024;
export const PACKAGE_INLINE_TOTAL_MAX = 8 * 1024 * 1024;

function dataUrlOf(bytes: Uint8Array, type: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

export type CutPackageImport = {
  manifest: CutPackageManifest;
  cut: CutPackageManifest['cut'];
  /** URLs that still answer here, kept as they are. */
  kept: number;
  /** Packaged files already stored here (by hash), relinked without storing again. */
  reused: number;
  /** Packaged files stored in this Gallery and relinked. */
  stored: number;
  /** Small packaged files kept in the cut itself (no server storage here). */
  inlined: number;
  /** Media neither here nor in the package. */
  missing: string[];
};

export async function importCutPackage(
  file: Blob,
  deps: {
    check?: (url: string) => Promise<MediaUrlStatus>;
    store?: (entryId: string, file: File) => Promise<string | null>;
  } = {}
): Promise<{ ok: true; result: CutPackageImport } | { ok: false; error: string }> {
  const check = deps.check ?? (url => checkMediaUrl(url));
  const store =
    deps.store ??
    (async (entryId: string, upload: File) =>
      (await persistGalleryOriginal(entryId, upload))?.originalUrl ?? null);
  let entries;
  try {
    entries = await readZipBinaryEntries(await file.arrayBuffer());
  } catch {
    return { ok: false, error: 'That file isn’t a readable .zip.' };
  }
  const manifestEntry = entries.find(entry => entry.filename === CUT_PACKAGE_MANIFEST);
  if (!manifestEntry)
    return { ok: false, error: 'This .zip isn’t a Cut package (no castcut-cut.json).' };
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(manifestEntry.data));
  } catch {
    return { ok: false, error: 'The package’s castcut-cut.json can’t be read.' };
  }
  const parsed = parseCutPackageManifest(raw);
  if (!parsed.ok) return parsed;
  const { manifest } = parsed;
  const byName = new Map(entries.map(entry => [entry.filename, entry.data]));
  const map = new Map<string, string>();
  let kept = 0;
  let reused = 0;
  let stored = 0;
  let inlined = 0;
  let inlineBudget = PACKAGE_INLINE_TOTAL_MAX;
  const missing: string[] = [];
  for (const media of manifest.media) {
    if ((await check(media.url)) === 'ok') {
      kept += 1;
      continue;
    }
    const bytes = media.file ? byName.get(media.file) : undefined;
    if (!bytes || !media.sha256) {
      missing.push(media.url);
      continue;
    }
    const entryId = packageMediaEntryId(media.sha256);
    const here = `/api/gallery/media/${encodeURIComponent(entryId)}?variant=original`;
    if ((await check(here)) === 'ok') {
      map.set(media.url, here);
      reused += 1;
      continue;
    }
    const name = media.file!.split('/').pop() ?? 'media.bin';
    const url = await store(
      entryId,
      new File([bytes as BlobPart], name, { type: media.contentType || 'application/octet-stream' })
    );
    if (url) {
      map.set(media.url, url);
      stored += 1;
    } else if (bytes.length <= PACKAGE_INLINE_FILE_MAX && bytes.length <= inlineBudget) {
      map.set(media.url, dataUrlOf(bytes, media.contentType ?? ''));
      inlineBudget -= bytes.length;
      inlined += 1;
    } else {
      missing.push(media.url);
    }
  }
  return {
    ok: true,
    result: {
      manifest,
      cut: rewriteCutMedia(manifest.cut, map),
      kept,
      reused,
      stored,
      inlined,
      missing,
    },
  };
}
