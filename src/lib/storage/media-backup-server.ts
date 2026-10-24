import 'server-only';

/**
 * Pictures backup: the files the JSON studio backup only names. One .tar holding the Gallery's
 * kept copies (gallery-media), the identity lock, and the ComfyUI pictures the Cast and plates
 * use. Export streams straight to the browser's download; restore uploads in chunks (the proxy
 * caps a request at 80 MB) to a staging file, then unpacks it into this server and its ComfyUI.
 * Paths in the archive carry no owner, so a backup from a signed-in server restores into a
 * server without sign-in (and the other way round).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { resolvePromptDataDir } from '../prompt/data-paths';
import { type ComfyFileRef } from './media-backup-refs';
import {
  hasComfyInputCopy,
  keepComfyInputCopy,
  readComfyInputCopy,
} from '../comfyui/input-store-server';
import {
  TAR_BLOCK,
  readPaxPath,
  readTarHeader,
  tarEnd,
  tarFileHeader,
  tarPadding,
} from './tar-format';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const SAFE_OWNER = /^[A-Za-z0-9._-]{1,128}$/;
const MANIFEST = 'castcut-media-backup.json';
/** A Cast bundle's own data (Cast file v2): the record, its Story, Day plan and Gallery entries. */
export const CAST_BUNDLE_DATA = 'castcut-cast.json';
const MAX_CAST_DATA_BYTES = 64 * 1024 * 1024;
const READ_CHUNK = 1024 * 1024;

export function mediaBackupOwner(userId?: string | null): string {
  const raw = userId?.trim() || '_global';
  return SAFE_OWNER.test(raw) && raw !== '.' && raw !== '..' ? raw : '_global';
}

function dataRoot(): string {
  return resolvePromptDataDir();
}

function* walkFiles(root: string, rel = ''): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walkFiles(root, child);
    else if (entry.isFile()) yield child;
  }
}

async function* fileBytes(filePath: string, size: number): AsyncGenerator<Uint8Array> {
  if (size === 0) return;
  let sent = 0;
  try {
    for await (const chunk of fs.createReadStream(filePath, { start: 0, end: size - 1 })) {
      const bytes = chunk as Buffer;
      sent += bytes.length;
      yield bytes;
    }
  } catch {
    // Deleted mid-export: pad below keeps the archive readable.
  }
  // A file that shrank while being read still has to fill the size its header promised.
  if (sent < size) yield new Uint8Array(size - sent);
}

export type MediaBackupCounts = {
  galleryFiles: number;
  identityFiles: number;
  comfyFiles: number;
  comfyMissing: number;
};

/** The whole Pictures backup as one tar stream. */
export async function* mediaBackupTar(input: {
  owner: string;
  comfyUrl: string;
  comfyFiles: ComfyFileRef[];
  /** Only these Gallery entries' kept copies, and no identity lock (a Cast bundle). */
  galleryEntryIds?: string[];
  /** A Cast bundle's data file, written first. */
  castData?: string;
  fetchImpl?: FetchLike;
}): AsyncGenerator<Uint8Array> {
  const bundle = Array.isArray(input.galleryEntryIds);
  const onlyEntries = bundle ? new Set(input.galleryEntryIds) : null;
  if (input.castData) {
    const bytes = new TextEncoder().encode(input.castData);
    yield tarFileHeader(CAST_BUNDLE_DATA, bytes.length, Date.now() / 1000);
    yield bytes;
    yield tarPadding(bytes.length);
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const counts: MediaBackupCounts = {
    galleryFiles: 0,
    identityFiles: 0,
    comfyFiles: 0,
    comfyMissing: 0,
  };
  const sections: Array<{
    prefix: 'gallery-media' | 'identity';
    key: 'galleryFiles' | 'identityFiles';
  }> = [
    { prefix: 'gallery-media', key: 'galleryFiles' },
    ...(bundle ? [] : [{ prefix: 'identity' as const, key: 'identityFiles' as const }]),
  ];
  for (const section of sections) {
    const root = path.join(/* turbopackIgnore: true */ dataRoot(), section.prefix, input.owner);
    for (const rel of walkFiles(root)) {
      if (onlyEntries && section.prefix === 'gallery-media') {
        const entryId = rel.split('/')[0] ?? '';
        if (!onlyEntries.has(entryId)) continue;
      }
      const filePath = path.join(root, rel);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      yield tarFileHeader(`${section.prefix}/${rel}`, stat.size, stat.mtimeMs / 1000);
      yield* fileBytes(filePath, stat.size);
      yield tarPadding(stat.size);
      counts[section.key] += 1;
    }
  }

  const base = input.comfyUrl.replace(/\/+$/, '');
  const missing: string[] = [];
  for (const ref of input.comfyFiles) {
    const params = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder,
      type: ref.type,
    });
    let bytes: Uint8Array | null = null;
    try {
      const response = await fetchImpl(`${base}/view?${params.toString()}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      bytes = null;
    }
    // ComfyUI lost it (another install, a cleaned folder): the app's own copy.
    if (!bytes) bytes = readComfyInputCopy(ref);
    if (!bytes) {
      counts.comfyMissing += 1;
      missing.push(ref.subfolder ? `${ref.subfolder}/${ref.filename}` : ref.filename);
      continue;
    }
    const rel = [ref.type, ref.subfolder, ref.filename].filter(Boolean).join('/');
    yield tarFileHeader(`comfy/${rel}`, bytes.length, Date.now() / 1000);
    yield bytes;
    yield tarPadding(bytes.length);
    counts.comfyFiles += 1;
  }

  const manifest = new TextEncoder().encode(
    JSON.stringify(
      {
        app: 'castcut',
        kind: bundle ? 'cast-bundle' : 'media-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        counts,
        // ComfyUI files the data names that the exporting install no longer had.
        missing: missing.slice(0, 200),
      },
      null,
      2
    )
  );
  yield tarFileHeader(MANIFEST, manifest.length, Date.now() / 1000);
  yield manifest;
  yield tarPadding(manifest.length);
  yield tarEnd();
}

export function mediaBackupWebStream(
  input: Parameters<typeof mediaBackupTar>[0]
): ReadableStream<Uint8Array> {
  return Readable.toWeb(Readable.from(mediaBackupTar(input))) as ReadableStream<Uint8Array>;
}

/* ---------- export tickets: POST the file list, then a plain GET downloads ---------- */

type Ticket = {
  owner: string;
  comfyUrl?: string;
  comfyFiles: ComfyFileRef[];
  galleryEntryIds?: string[];
  castData?: string;
  filename?: string;
  expires: number;
};
const tickets = new Map<string, Ticket>();

export function createMediaBackupTicket(ticket: Omit<Ticket, 'expires'>): string {
  const now = Date.now();
  for (const [id, entry] of tickets) if (entry.expires < now) tickets.delete(id);
  const id = crypto.randomUUID();
  tickets.set(id, { ...ticket, expires: now + 10 * 60_000 });
  return id;
}

export function takeMediaBackupTicket(id: string, owner: string): Ticket | null {
  const ticket = tickets.get(id);
  if (!ticket || ticket.expires < Date.now() || ticket.owner !== owner) return null;
  tickets.delete(id);
  return ticket;
}

/* ---------- restore: chunked upload to a staging file, then unpack ---------- */

const UPLOAD_ID = /^[0-9a-f-]{36}$/;

function stagingDir(): string {
  return path.join(/* turbopackIgnore: true */ dataRoot(), 'media-restore');
}

function stagingPath(id: string): string {
  if (!UPLOAD_ID.test(id)) throw new Error('Invalid upload id.');
  return path.join(stagingDir(), `${id}.tar`);
}

export function startMediaRestoreUpload(): string {
  fs.mkdirSync(stagingDir(), { recursive: true });
  // Leftovers from abandoned restores older than a day.
  const dayAgo = Date.now() - 86_400_000;
  for (const name of fs.readdirSync(stagingDir())) {
    const filePath = path.join(stagingDir(), name);
    try {
      if (fs.statSync(filePath).mtimeMs < dayAgo) fs.rmSync(filePath, { force: true });
    } catch {
      // ignore
    }
  }
  const id = crypto.randomUUID();
  fs.writeFileSync(stagingPath(id), new Uint8Array(0));
  return id;
}

/** Bytes the server holds for an upload (the client resumes from here). */
export function mediaRestoreUploadedBytes(id: string): number | null {
  try {
    return fs.statSync(stagingPath(id)).size;
  } catch {
    return null;
  }
}

/** Append one chunk at `offset`; a chunk already received is ignored. Returns bytes held. */
export function appendMediaRestoreChunk(id: string, offset: number, chunk: Uint8Array): number {
  const held = mediaRestoreUploadedBytes(id);
  if (held === null) throw new Error('Upload not found. Start again.');
  if (offset + chunk.length <= held) return held;
  if (offset !== held) throw new Error(`Upload is at ${held} bytes, not ${offset}.`);
  fs.appendFileSync(stagingPath(id), chunk);
  return held + chunk.length;
}

export type MediaRestoreJob = {
  id: string;
  state: 'running' | 'done' | 'failed';
  bytesTotal: number;
  bytesDone: number;
  galleryFiles: number;
  identityFiles: number;
  comfyUploaded: number;
  skipped: number;
  errors: string[];
  message?: string;
  /** A Cast bundle's data file (the browser adds the Cast from it). */
  castData?: string;
  /** Files the exporting install already lacked (from the archive's manifest). */
  missingAtExport?: string[];
};

const jobs = new Map<string, MediaRestoreJob>();

export function getMediaRestoreJob(id: string): MediaRestoreJob | null {
  return jobs.get(id) ?? null;
}

function safeRelative(rel: string): string | null {
  const parts = rel.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part === '.' || part === '..' || part.length > 255 || /[\\\x00-\x1f]/.test(part))
      return null;
  }
  return parts.join('/');
}

async function readExactly(
  handle: fs.promises.FileHandle,
  position: number,
  length: number
): Promise<Uint8Array> {
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const { bytesRead } = await handle.read(buffer, read, length - read, position + read);
    if (bytesRead === 0) throw new Error('The backup file ends early (upload incomplete?).');
    read += bytesRead;
  }
  return buffer;
}

async function copyRange(
  handle: fs.promises.FileHandle,
  position: number,
  size: number,
  target: string
): Promise<void> {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.restore-${process.pid}`;
  const out = await fs.promises.open(temp, 'w');
  try {
    for (let done = 0; done < size; done += READ_CHUNK) {
      await out.write(
        await readExactly(handle, position + done, Math.min(READ_CHUNK, size - done))
      );
    }
  } finally {
    await out.close();
  }
  fs.renameSync(temp, target);
}

async function comfyHas(fetchImpl: FetchLike, base: string, ref: ComfyFileRef): Promise<boolean> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  try {
    const response = await fetchImpl(`${base}/view?${params.toString()}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function comfyUpload(
  fetchImpl: FetchLike,
  base: string,
  ref: ComfyFileRef,
  bytes: Uint8Array
): Promise<void> {
  const form = new FormData();
  form.set('image', new Blob([bytes as BlobPart]), ref.filename);
  form.set('type', ref.type);
  form.set('subfolder', ref.subfolder);
  // Same name the Cast and plates point at; the HEAD check above already skipped files present.
  form.set('overwrite', 'true');
  const response = await fetchImpl(`${base}/upload/image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`ComfyUI upload returned HTTP ${response.status}`);
}

/** Unpack a staged backup. Files already on this server (same size) are skipped, so a rerun is safe. */
export async function runMediaRestore(input: {
  uploadId: string;
  owner: string;
  comfyUrl: string;
  fetchImpl?: FetchLike;
  job?: MediaRestoreJob;
}): Promise<MediaRestoreJob> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const file = stagingPath(input.uploadId);
  const bytesTotal = fs.statSync(file).size;
  const job: MediaRestoreJob = input.job ?? {
    id: input.uploadId,
    state: 'running',
    bytesTotal,
    bytesDone: 0,
    galleryFiles: 0,
    identityFiles: 0,
    comfyUploaded: 0,
    skipped: 0,
    errors: [],
  };
  job.bytesTotal = bytesTotal;
  const base = input.comfyUrl.replace(/\/+$/, '');
  const handle = await fs.promises.open(file, 'r');
  let sawManifest = false;
  try {
    let position = 0;
    let longPath: string | null = null;
    while (position + TAR_BLOCK <= bytesTotal) {
      const header = readTarHeader(await readExactly(handle, position, TAR_BLOCK));
      if (!header) break;
      const bodyAt = position + TAR_BLOCK;
      position = bodyAt + header.size + tarPadding(header.size).length;
      job.bytesDone = Math.min(position, bytesTotal);
      if (header.type === 'x') {
        longPath = readPaxPath(await readExactly(handle, bodyAt, header.size));
        continue;
      }
      const name = longPath ?? header.name;
      longPath = null;
      if (header.type !== '0' && header.type !== '\0') continue;
      if (name === MANIFEST) {
        sawManifest = true;
        try {
          const manifest = JSON.parse(
            new TextDecoder().decode(
              await readExactly(handle, bodyAt, Math.min(header.size, 1 << 20))
            )
          ) as { missing?: unknown };
          if (Array.isArray(manifest.missing)) {
            job.missingAtExport = manifest.missing.filter(
              (entry): entry is string => typeof entry === 'string'
            );
          }
        } catch {
          // An older manifest: no list.
        }
        continue;
      }
      if (name === CAST_BUNDLE_DATA) {
        if (header.size > MAX_CAST_DATA_BYTES)
          throw new Error('The Cast data in this bundle is too large.');
        job.castData = new TextDecoder().decode(await readExactly(handle, bodyAt, header.size));
        continue;
      }
      try {
        const slash = name.indexOf('/');
        const section = name.slice(0, slash);
        const rel = safeRelative(name.slice(slash + 1));
        if (slash < 0 || !rel) throw new Error('unsafe path');
        if (section === 'gallery-media' || section === 'identity') {
          const target = path.join(
            /* turbopackIgnore: true */ dataRoot(),
            section,
            input.owner,
            rel
          );
          let existing = -1;
          try {
            existing = fs.statSync(target).size;
          } catch {
            existing = -1;
          }
          if (existing === header.size) {
            job.skipped += 1;
            continue;
          }
          await copyRange(handle, bodyAt, header.size, target);
          if (section === 'gallery-media') job.galleryFiles += 1;
          else job.identityFiles += 1;
        } else if (section === 'comfy') {
          const parts = rel.split('/');
          const type = parts.shift();
          const filename = parts.pop();
          if ((type !== 'input' && type !== 'output') || !filename) throw new Error('unsafe path');
          const ref: ComfyFileRef = { type, subfolder: parts.join('/'), filename };
          const has = await comfyHas(fetchImpl, base, ref);
          if (has && hasComfyInputCopy(ref)) {
            job.skipped += 1;
            continue;
          }
          const bytes = await readExactly(handle, bodyAt, header.size);
          // The app keeps its own copy too, so the next ComfyUI switch needs no backup.
          keepComfyInputCopy(ref, bytes);
          if (has) {
            job.skipped += 1;
            continue;
          }
          await comfyUpload(fetchImpl, base, ref, bytes);
          job.comfyUploaded += 1;
        }
      } catch (error) {
        if (job.errors.length < 50) {
          job.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    if (!sawManifest)
      throw new Error('This is not a complete Pictures backup (no manifest at the end).');
    job.state = 'done';
    job.bytesDone = bytesTotal;
    fs.rmSync(file, { force: true });
  } catch (error) {
    job.state = 'failed';
    job.message = error instanceof Error ? error.message : String(error);
  } finally {
    await handle.close();
  }
  return job;
}

/** Start unpacking in the background; poll getMediaRestoreJob. */
export function startMediaRestoreJob(input: {
  uploadId: string;
  owner: string;
  comfyUrl: string;
}): MediaRestoreJob {
  const running = jobs.get(input.uploadId);
  if (running?.state === 'running') return running;
  stagingPath(input.uploadId);
  const job: MediaRestoreJob = {
    id: input.uploadId,
    state: 'running',
    bytesTotal: 0,
    bytesDone: 0,
    galleryFiles: 0,
    identityFiles: 0,
    comfyUploaded: 0,
    skipped: 0,
    errors: [],
  };
  jobs.set(input.uploadId, job);
  void runMediaRestore({ ...input, job });
  return job;
}
