/**
 * The frame a Cut bridge starts or ends on (cut-bridge.ts), as a ComfyUI input: a still shot as
 * it is, a clip's first or last frame. Animated WebP (WAN / LTX clips) is read with sharp — ffmpeg
 * misreads its frames; MP4 / WebM with ffmpeg.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from './comfyui/comfy-input-upload-server';
import { filmTempOsDir, resolveFfmpegBinary } from './video-server-encode';

/** A clip's first or last frame, or the frame at a second (a freeze frame). */
export type CutBridgeEdge = 'first' | 'last' | { atSec: number };

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))
    );
  });
}

function looksLikeVideo(bytes: Uint8Array, contentType?: string): boolean {
  if (/^video\//i.test(contentType ?? '')) return true;
  // ISO-BMFF ("ftyp" at 4) or Matroska / WebM (1A 45 DF A3).
  const ftyp = bytes.length > 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  const ebml = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return ftyp || ebml;
}

/** The page of an animated picture shown at `atSec` (its per-page delays in ms). */
export function animatedPageAt(delays: readonly number[], pages: number, atSec: number): number {
  let elapsed = 0;
  for (let page = 0; page < pages; page += 1) {
    elapsed += (delays[page] ?? 100) / 1000;
    if (atSec < elapsed) return page;
  }
  return Math.max(0, pages - 1);
}

/** One frame of the shot as PNG bytes: a still as it is, a clip's first or last frame. */
export async function shotFramePng(
  bytes: Uint8Array,
  edge: CutBridgeEdge,
  contentType?: string
): Promise<Uint8Array> {
  const sharp = (await import('sharp')).default;
  if (!looksLikeVideo(bytes, contentType)) {
    // A still, or an animated WebP / GIF clip: sharp reads its pages.
    const meta = await sharp(bytes, { animated: true }).metadata();
    const pages = meta.pages ?? 1;
    const page =
      edge === 'last'
        ? pages - 1
        : edge === 'first'
          ? 0
          : animatedPageAt(meta.delay ?? [], pages, edge.atSec);
    return new Uint8Array(await sharp(bytes, { page }).png().toBuffer());
  }
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `bridge-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const clip = path.join(/* turbopackIgnore: true */ dir, 'clip');
    const png = path.join(/* turbopackIgnore: true */ dir, 'frame.png');
    await fs.writeFile(/* turbopackIgnore: true */ clip, bytes);
    await run(
      ffmpeg,
      edge === 'last'
        ? [
            '-y',
            '-v',
            'error',
            '-sseof',
            '-0.25',
            '-i',
            clip,
            '-update',
            '1',
            '-frames:v',
            '1',
            png,
          ]
        : edge === 'first'
          ? ['-y', '-v', 'error', '-i', clip, '-frames:v', '1', png]
          : [
              '-y',
              '-v',
              'error',
              '-ss',
              Math.max(0, edge.atSec).toFixed(3),
              '-i',
              clip,
              '-frames:v',
              '1',
              png,
            ]
    );
    return new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ png));
  } finally {
    await fs.rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** The shot's frame uploaded to ComfyUI's input folder → its filename. */
export async function uploadCutBridgeFrame(input: {
  url: string;
  edge: CutBridgeEdge;
  baseUrl: string;
  requestOrigin?: string;
  userId?: string | null;
}): Promise<string> {
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.url,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const png = await shotFramePng(new Uint8Array(fetched.buffer), input.edge, fetched.contentType);
  const uploaded = await uploadComfyInputContent({
    baseUrl: input.baseUrl,
    bytes: png,
    filename: `castcut-${typeof input.edge === 'string' ? `bridge-${input.edge}` : 'freeze'}.png`,
    mimeType: 'image/png',
  });
  return uploaded.name;
}
