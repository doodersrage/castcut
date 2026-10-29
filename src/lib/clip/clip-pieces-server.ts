/**
 * Server: clip pieces for joining clips — read a clip's frames and size, grab a frame, set a piece
 * to 24 fps at a size with a sound track, and a frame's colour statistics. Shared by Make it
 * 30 s (extend-server.ts) and a clip continued with a directed move (continue-server.ts).
 */

import { spawn } from 'node:child_process';
import { LTX25_FPS } from '../video/ltx25-renderer';
import type { ChannelStats } from './extend';

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

export type Probe = { frames: number; width: number; height: number; audio: boolean };

export async function probe(ffmpeg: string, file: string): Promise<Probe> {
  const log = await run(ffmpeg, ['-i', file, '-map', '0:v:0', '-f', 'null', '-']).catch(error =>
    String(error instanceof Error ? error.message : error)
  );
  const frames = Number([...log.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1] ?? 0);
  const size = log.match(/Video:.*?,\s(\d{2,5})x(\d{2,5})[\s,[]/);
  if (!frames || !size) throw new Error('Could not read that clip.');
  return {
    frames,
    width: Number(size[1]),
    height: Number(size[2]),
    audio: /Stream #\d+:\d+.*Audio:/.test(log),
  };
}

export async function frameStats(file: string): Promise<ChannelStats> {
  const sharp = (await import('sharp')).default;
  const stats = await sharp(file).stats();
  return {
    mean: stats.channels.slice(0, 3).map(channel => channel.mean),
    std: stats.channels.slice(0, 3).map(channel => channel.stdev),
  };
}

export async function grabFrame(
  ffmpeg: string,
  file: string,
  seconds: number,
  out: string
): Promise<void> {
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-i',
    file,
    '-ss',
    seconds.toFixed(3),
    '-frames:v',
    '1',
    out,
  ]);
}

/** The piece at 24 fps, `width`×`height`, with a sound track (silence when it has none). */
export async function normalizePiece(
  ffmpeg: string,
  source: string,
  out: string,
  size: { width: number; height: number },
  skipFrames = 0,
  colorFilter?: string,
  /** Keep at most this many frames (after the skipped ones). */
  maxFrames?: number
): Promise<Probe> {
  const { audio } = await probe(ffmpeg, source);
  const end = maxFrames && maxFrames > 0 ? skipFrames + maxFrames : 0;
  const trim = `${skipFrames || end ? `,trim=start_frame=${skipFrames}${end ? `:end_frame=${end}` : ''},setpts=PTS-STARTPTS` : ''}${colorFilter ? `,${colorFilter}` : ''}`;
  await run(ffmpeg, [
    '-y',
    '-i',
    source,
    ...(audio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
    '-vf',
    `fps=${LTX25_FPS}${trim},scale=${size.width}:${size.height}:flags=lanczos,setsar=1`,
    ...(audio
      ? [
          '-af',
          `aresample=48000${skipFrames || end ? `,atrim=start=${skipFrames / 24}${end ? `:end=${end / 24}` : ''},asetpts=PTS-STARTPTS` : ''}`,
        ]
      : ['-map', '0:v:0', '-map', '1:a:0', '-shortest']),
    '-c:v',
    'libx264',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-ac',
    '2',
    out,
  ]);
  return probe(ffmpeg, out);
}
