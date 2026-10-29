/**
 * Server: a clip continued with a directed move ("Continue with a directed move…"). The clip's
 * last frame is the still Copy moves starts from (motion-transfer-server.ts); its clip is then
 * joined on: the clip's own size at 24 fps, Copy moves' 16 fps filled in by motion interpolation
 * (repeating frames stuttered — 23 of every 72 repeated), its colours matched to the frame it
 * started from, its first frame (that frame again) dropped, and quiet room tone under it where
 * the clip had sound (Wan Animate makes none). Spike (2026-10-29, M11 T8): colour step at the
 * join 0.5–0.8, motion at the join as the frames around it.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { uploadComfyInputContent } from '@/lib/comfyui/comfy-input-upload-server';
import { comfyBaseUrl } from '@/lib/comfyui/comfy-utility-graph-server';
import { filmTempOsDir, resolveFfmpegBinary } from '@/lib/video/server-encode';
import { writeClipSource } from './clip-source-server';
import { frameStats, grabFrame, normalizePiece, probe } from './clip-pieces-server';
import { colorMatchFilter, colorMatchGains } from './extend';

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', code =>
      code === 0 ? resolve(stderr) : reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))
    );
  });
}

/** The clip's last frame as a PNG (`out`), for the still a continuation starts from. */
export async function clipLastFrame(
  ffmpeg: string,
  clip: Buffer,
  dir: string
): Promise<{ png: string; source: string }> {
  const source = path.join(/* turbopackIgnore: true */ dir, 'clip.bin');
  await writeClipSource(ffmpeg, clip, source);
  const png = path.join(/* turbopackIgnore: true */ dir, 'last.png');
  await run(ffmpeg, ['-y', '-v', 'error', '-sseof', '-0.1', '-i', source, '-update', '1', png]);
  return { png, source };
}

/**
 * The clip's last frame in ComfyUI's input, as a view URL: the still the Director reads her pose
 * and framing from to continue the clip.
 */
export async function clipLastFrameUrl(input: {
  clipUrl: string;
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
}): Promise<string> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('@/lib/video/shot-fetch');
  const clip = await fetchFilmShotBytes({
    url: input.clipUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `clip-frame-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const { png } = await clipLastFrame(ffmpeg, clip.buffer, dir);
    const kept = await uploadComfyInputContent({
      baseUrl: comfyBaseUrl(input.comfyUrl),
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ png)),
      filename: 'castcut-clip-last-frame.png',
      mimeType: 'image/png',
    });
    return `/api/comfyui/view?${new URLSearchParams({ filename: kept.name, type: 'input' }).toString()}`;
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

/** The first seconds of the move eased in from the clip's last frame. */
const EASE_IN = 0.25;

async function frameRate(ffmpeg: string, file: string): Promise<number> {
  const log = await run(ffmpeg, ['-i', file]).catch(error =>
    String(error instanceof Error ? error.message : error)
  );
  const match = log.match(/,\s*([\d.]+)\s*fps/);
  return match ? Number(match[1]) : 0;
}

/** Room tone under a part without sound: brown noise far under speech (about −48 dBFS). */
const ROOM_TONE = 'anoisesrc=color=brown:amplitude=0.004:sample_rate=48000';

/** `clip` (a written clip source) and `moves` joined into `out` (MP4, 24 fps). */
export async function joinContinuation(
  ffmpeg: string,
  input: { clip: string; moves: string; dir: string; out: string }
): Promise<{ seconds: number }> {
  const at = (name: string) => path.join(/* turbopackIgnore: true */ input.dir, name);
  const original = await probe(ffmpeg, input.clip);
  const size = { width: original.width & ~1, height: original.height & ~1 };
  const first = await normalizePiece(ffmpeg, input.clip, at('join-a.mp4'), size);
  // Copy moves' clip at the clip's size (cropped to its shape) — at 24 fps already when the
  // Director filmed it so; a 16 fps one is filled in (motion interpolation smears a fast hand
  // now and then, so the Director films continuations at 24).
  const rate = await frameRate(ffmpeg, input.moves);
  const fill =
    rate > 0 && rate < 23
      ? ',minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'
      : ',fps=24';
  await run(ffmpeg, [
    '-y',
    '-i',
    input.moves,
    '-an',
    '-vf',
    `scale=${size.width}:${size.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${size.width}:${size.height}${fill}`,
    '-c:v',
    'libx264',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    at('moves24.mp4'),
  ]);
  await grabFrame(ffmpeg, at('join-a.mp4'), Math.max(0, first.frames - 1) / 24, at('seam.png'));
  await grabFrame(ffmpeg, at('moves24.mp4'), 0, at('moves-first.png'));
  const match = colorMatchFilter(
    colorMatchGains(await frameStats(at('seam.png')), await frameStats(at('moves-first.png')))
  );
  await normalizePiece(ffmpeg, at('moves24.mp4'), at('join-m.mp4'), size, 1, match);
  // Eased in from the clip's last frame over EASE_IN seconds: Copy moves refits her to the
  // driving video's body at its first frame, a little off the still (a jump of 7× the frame-to-
  // frame change at the join, live).
  await run(ffmpeg, [
    '-y',
    '-loop',
    '1',
    '-t',
    String(EASE_IN),
    '-framerate',
    '24',
    '-i',
    at('seam.png'),
    '-i',
    at('join-m.mp4'),
    '-filter_complex',
    `[0:v]scale=${size.width}:${size.height},setsar=1,fps=24,settb=1/24,format=yuv420p[a];[1:v]fps=24,settb=1/24,format=yuv420p[b];[a][b]xfade=transition=fade:duration=${EASE_IN}:offset=0[v]`,
    '-map',
    '[v]',
    '-map',
    '1:a',
    '-c:v',
    'libx264',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    at('join-b.mp4'),
  ]);
  const second = await probe(ffmpeg, at('join-b.mp4'));
  const seconds = second.frames / 24;
  // Sound: the clip's, then room tone where it had any (silence stays silence), crossfaded.
  const tone = original.audio
    ? `${ROOM_TONE}:duration=${(seconds + 0.5).toFixed(3)},volume=1[tone];[0:a][tone]acrossfade=d=0.3:c1=tri:c2=tri,atrim=end=${((first.frames + second.frames) / 24).toFixed(3)}[a]`
    : `[0:a][1:a]concat=n=2:v=0:a=1[a]`;
  await run(ffmpeg, [
    '-y',
    '-i',
    at('join-a.mp4'),
    '-i',
    at('join-b.mp4'),
    '-filter_complex',
    `[0:v][1:v]concat=n=2:v=1:a=0[v];${tone}`,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    input.out,
  ]);
  const done = await probe(ffmpeg, input.out);
  await fs
    .rm(/* turbopackIgnore: true */ at('moves24.mp4'), { force: true })
    .catch(() => undefined);
  return { seconds: Math.round((done.frames / 24) * 10) / 10 };
}
