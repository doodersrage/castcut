/**
 * Minimal ZIP reader (store + deflate) for server plugin install packages.
 * No third-party unzip dependency — Node zlib only.
 */

import { inflateRawSync } from 'node:zlib';

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY = 0x02014b50;

export type PluginZipEntry = {
  path: string;
  data: Buffer;
};

function readUInt32LE(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

function readUInt16LE(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

/**
 * Extract files from a ZIP buffer. Skips directories and rejects path traversal.
 */
export function extractPluginZip(buffer: Buffer): PluginZipEntry[] {
  if (buffer.length < 22) {
    throw new Error('ZIP archive is too small.');
  }

  const entries: PluginZipEntry[] = [];
  let offset = 0;

  while (offset + 30 <= buffer.length) {
    const signature = readUInt32LE(buffer, offset);
    if (signature === CENTRAL_DIRECTORY) {
      break;
    }
    if (signature !== LOCAL_FILE_HEADER) {
      // Seek forward carefully — some tools pad before the central directory.
      if (signature === 0) {
        break;
      }
      throw new Error('Invalid ZIP local file header.');
    }

    const compression = readUInt16LE(buffer, offset + 8);
    const compressedSize = readUInt32LE(buffer, offset + 18);
    const fileNameLength = readUInt16LE(buffer, offset + 26);
    const extraLength = readUInt16LE(buffer, offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd + extraLength > buffer.length) {
      throw new Error('Corrupt ZIP entry header.');
    }
    const rawName = buffer.subarray(nameStart, nameEnd).toString('utf8');
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) {
      throw new Error('Corrupt ZIP entry data.');
    }

    const normalized = normalizeZipPath(rawName);
    if (normalized && !normalized.endsWith('/')) {
      const compressed = buffer.subarray(dataStart, dataEnd);
      let data: Buffer;
      if (compression === 0) {
        data = Buffer.from(compressed);
      } else if (compression === 8) {
        data = inflateRawSync(compressed);
      } else {
        throw new Error(`Unsupported ZIP compression method ${compression} for ${normalized}.`);
      }
      entries.push({ path: normalized, data });
    }

    offset = dataEnd;
  }

  if (entries.length === 0) {
    throw new Error('ZIP archive contained no files.');
  }

  return entries;
}

/** Strip absolute / traversal segments; return null for directory-only paths. */
export function normalizeZipPath(raw: string): string | null {
  const trimmed = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!trimmed || trimmed.endsWith('/')) {
    return trimmed || null;
  }
  const parts = trimmed.split('/').filter(part => part && part !== '.' && part !== '..');
  if (parts.length === 0) {
    return null;
  }
  // Reject absolute Windows drives that survived filtering
  if (/^[a-zA-Z]:$/.test(parts[0] ?? '')) {
    return null;
  }
  return parts.join('/');
}

/**
 * Prefer a root manifest.json; otherwise accept a single top-level folder that
 * contains manifest.json (common when zipping a plugin directory).
 */
export function pickPluginManifestFromZip(entries: PluginZipEntry[]): {
  manifestRaw: string;
  relativeRoot: string;
  files: PluginZipEntry[];
} {
  const byPath = new Map(entries.map(entry => [entry.path, entry]));
  const rootManifest = byPath.get('manifest.json');
  if (rootManifest) {
    return {
      manifestRaw: rootManifest.data.toString('utf8'),
      relativeRoot: '',
      files: entries,
    };
  }

  const nested = entries.filter(entry => {
    const parts = entry.path.split('/');
    return parts.length === 2 && parts[1] === 'manifest.json';
  });
  if (nested.length === 1) {
    const folder = nested[0]!.path.split('/')[0]!;
    const prefix = `${folder}/`;
    const files = entries
      .filter(entry => entry.path.startsWith(prefix))
      .map(entry => ({
        path: entry.path.slice(prefix.length),
        data: entry.data,
      }))
      .filter(entry => entry.path.length > 0);
    const manifest = files.find(entry => entry.path === 'manifest.json');
    if (!manifest) {
      throw new Error('ZIP is missing manifest.json.');
    }
    return {
      manifestRaw: manifest.data.toString('utf8'),
      relativeRoot: folder,
      files,
    };
  }

  throw new Error('ZIP must contain manifest.json at the root or in a single top-level folder.');
}
