/**
 * Where a shot's face-following crop goes (cut-reframe.ts), from the shot's bytes: frames read
 * every ~1.5 s through what plays, the face found on each (FaceAnalysis via ComfyUI). Shared by the
 * render (video-server-encode.ts) and the monitor (POST /api/cut/reframe); answers are kept for a
 * while by content + window, so the monitor and the render look once.
 */

import { createHash } from 'node:crypto';
import {
  cropWidthFraction,
  reframePath,
  reframeSampleTimes,
  type ReframePoint,
  type ReframeSample,
} from './cut-reframe';

export type ShotReframeInput = {
  bytes: Uint8Array;
  kind: 'still' | 'clip';
  trimStart?: number | null;
  /** Seconds of the file that play (a clip's window). */
  playSec: number;
  reverse?: boolean;
  output: { width: number; height: number };
  comfyUrl?: string;
};

const cache = new Map<string, ReframePoint[] | null>();
const CACHE_MAX = 300;

/** The crop path, or null for the centre crop (fits already, no face, no face finder). */
export async function shotReframePath(input: ShotReframeInput): Promise<ReframePoint[] | null> {
  const key = createHash('sha1')
    .update(input.bytes)
    .update(
      JSON.stringify([
        input.kind,
        input.trimStart ?? 0,
        Math.round(input.playSec * 100),
        input.reverse === true,
        input.output.width,
        input.output.height,
      ])
    )
    .digest('hex');
  if (cache.has(key)) return cache.get(key)!;
  const path = await findPath(input);
  cache.set(key, path);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return path;
}

async function findPath(input: ShotReframeInput): Promise<ReframePoint[] | null> {
  const { shotFramePng } = await import('./cut-bridge-server');
  const { locateFaceInComfy } = await import('./face-locate-server');
  const sharp = (await import('sharp')).default;
  const times = input.kind === 'still' ? [0] : reframeSampleTimes(input.playSec);
  const samples: ReframeSample[] = [];
  let cropWidth = 1;
  for (const t of times) {
    const frame = await shotFramePng(
      input.bytes,
      input.kind === 'still' ? 'first' : { atSec: (input.trimStart ?? 0) + t }
    );
    const meta = await sharp(frame).metadata();
    if (!meta.width || !meta.height) continue;
    cropWidth = cropWidthFraction({ width: meta.width, height: meta.height }, input.output);
    if (cropWidth >= 0.999) return null;
    const found = await locateFaceInComfy({
      bytes: frame,
      width: meta.width,
      height: meta.height,
      comfyUrl: input.comfyUrl,
    });
    if (!found.available) return null;
    samples.push({
      t,
      cx: found.face ? (found.face.x + found.face.width / 2) / meta.width : null,
    });
  }
  const path = reframePath(samples, cropWidth);
  if (!path) return null;
  // A reversed clip holds still at the faces' mean (its frames run the other way).
  return input.reverse && path.length > 1
    ? [{ t: 0, x: Math.round((path.reduce((sum, p) => sum + p.x, 0) / path.length) * 1000) / 1000 }]
    : path;
}
