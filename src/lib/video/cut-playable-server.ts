import 'server-only';
/**
 * A clip the Cut's live preview can play (2026-11-11). The preview plays clips in a `<video>`,
 * which can't decode animated WebP — WAN's usual clip — so one such clip left the whole preview
 * black ("Could not load a clip.") and the timeline empty: 13 of a live Short's 15 kept clips were
 * WebP. The export already turns them into MP4 (animatedToMp4); this does the same for the
 * preview, once per clip (cached by its bytes), and passes anything else through.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isAnimatedImageClip } from '../clip/clip-source-server';
import { animatedToMp4 } from './cut-project-export-server';
import { filmTempOsDir, resolveFfmpegBinary } from './server-encode';

export type PlayableClip = { buffer: Buffer; contentType: string };

/** The clip as something `<video>` plays: an MP4 for an animated WebP / GIF, else as it came. */
export async function playableClip(input: {
  buffer: Buffer;
  contentType?: string;
}): Promise<PlayableClip> {
  if (!isAnimatedImageClip(input.buffer)) {
    return { buffer: input.buffer, contentType: input.contentType || 'video/mp4' };
  }
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), 'cut-playable');
  const key = createHash('sha256').update(input.buffer).digest('hex').slice(0, 32);
  const file = path.join(/* turbopackIgnore: true */ dir, `${key}.mp4`);
  const cached = await fs.readFile(/* turbopackIgnore: true */ file).catch(() => null);
  if (cached?.byteLength) return { buffer: cached, contentType: 'video/mp4' };
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  // Written beside, then moved in: a second request never reads half a file.
  const partial = `${file}.${process.pid}.${Date.now()}.part.mp4`;
  try {
    await animatedToMp4(ffmpeg, input.buffer, partial);
    await fs.rename(/* turbopackIgnore: true */ partial, /* turbopackIgnore: true */ file);
  } finally {
    await fs.rm(/* turbopackIgnore: true */ partial, { force: true }).catch(() => undefined);
  }
  return { buffer: await fs.readFile(/* turbopackIgnore: true */ file), contentType: 'video/mp4' };
}
