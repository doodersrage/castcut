/**
 * Server-only: read what each LoRA file was trained for (lora-family-detect.ts). Reads the
 * safetensors header straight from COMFYUI_ROOT/models/loras when this process can see it
 * (metadata + tensor names), else asks ComfyUI's /view_metadata (metadata only).
 */

import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { getComfyUiRoot } from '@/lib/comfy-asset-paths';
import { detectLoraFamily, type LoraFamilyDetection } from '@/lib/lora-family-detect';

export type LoraScanResult = { filename: string } & (
  LoraFamilyDetection | { family: 'unknown'; source: 'unreadable' | 'missing' }
);

/** Safetensors headers are JSON; cap what we read so a bad file can't eat memory. */
const MAX_HEADER_BYTES = 64 * 1024 * 1024;

function readLocalHeader(file: string): Record<string, unknown> | null {
  let fd: number | null = null;
  try {
    fd = openSync(file, 'r');
    const lengthBuf = Buffer.alloc(8);
    if (readSync(fd, lengthBuf, 0, 8, 0) !== 8) return null;
    const length = Number(lengthBuf.readBigUInt64LE());
    if (!Number.isFinite(length) || length <= 0 || length > MAX_HEADER_BYTES) return null;
    const header = Buffer.alloc(length);
    if (readSync(fd, header, 0, length, 8) !== length) return null;
    return JSON.parse(header.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** Rejects absolute paths and `..` — filenames come from ComfyUI's LoRA list. */
export function safeLoraRelativePath(filename: string): string | null {
  const trimmed = filename.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.startsWith('/') || trimmed.split('/').includes('..')) return null;
  return trimmed;
}

async function fetchComfyMetadata(
  baseUrl: string,
  filename: string
): Promise<Record<string, unknown> | null> {
  try {
    const url = new URL(`${baseUrl}/view_metadata/loras`);
    url.searchParams.set('filename', filename);
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function scanLoraFiles(input: {
  filenames: string[];
  comfyBaseUrl: string;
}): Promise<LoraScanResult[]> {
  const root = getComfyUiRoot();
  const loraDir = root ? path.join(/* turbopackIgnore: true */ root, 'models', 'loras') : null;
  const results: LoraScanResult[] = [];
  for (const raw of input.filenames) {
    const filename = safeLoraRelativePath(raw);
    if (!filename) {
      results.push({ filename: raw, family: 'unknown', source: 'unreadable' });
      continue;
    }
    const localPath = loraDir ? path.join(/* turbopackIgnore: true */ loraDir, filename) : null;
    const header = localPath ? readLocalHeader(localPath) : null;
    if (header) {
      const { __metadata__: metadata, ...tensors } = header as {
        __metadata__?: Record<string, unknown>;
      } & Record<string, unknown>;
      results.push({ filename, ...detectLoraFamily({ metadata, keys: Object.keys(tensors) }) });
      continue;
    }
    const metadata = await fetchComfyMetadata(input.comfyBaseUrl, filename);
    if (metadata) {
      results.push({ filename, ...detectLoraFamily({ metadata }) });
      continue;
    }
    // Not on disk under COMFYUI_ROOT and ComfyUI has no metadata for it: the file is gone.
    const missing = Boolean(localPath) && !existsSync(/* turbopackIgnore: true */ localPath!);
    results.push({ filename, family: 'unknown', source: missing ? 'missing' : 'unreadable' });
  }
  return results;
}
