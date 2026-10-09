/**
 * Cut a Cast voice sample out of a talking clip (server, ffmpeg): the clip's first ~5 s of sound,
 * mono WAV — what LTXVReferenceAudio wants. Live (2026-10-09, same still / line / seeds): the
 * whole 5 s held the voice best (similarity 0.81 / 0.78 vs 0.74 / 0.69 with no sample; pitch
 * 213–222 Hz vs 232–267 Hz, sample 213 Hz); trimming the lead-in silence left 2.9 s and varied
 * more (0.83 / 0.72).
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CAST_VOICE_SAMPLE_SEC } from './cast-voice';
import { filmTempOsDir, resolveFfmpegBinary } from './video-server-encode';

/** ffmpeg args: the first sample-length of sound, mono 24 kHz WAV. */
export function voiceSampleArgs(input: string, output: string): string[] {
  return [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-vn',
    '-t',
    String(CAST_VOICE_SAMPLE_SEC),
    '-ac',
    '1',
    '-ar',
    '24000',
    output,
  ];
}

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

/** The clip's voice as WAV bytes; throws when the clip has no sound. */
export async function extractVoiceSample(input: {
  clipUrl: string;
  requestOrigin?: string;
  userId?: string | null;
}): Promise<Uint8Array> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.clipUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `voice-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const clip = path.join(/* turbopackIgnore: true */ dir, 'clip.mp4');
    const wav = path.join(/* turbopackIgnore: true */ dir, 'voice.wav');
    await fs.writeFile(/* turbopackIgnore: true */ clip, fetched.buffer);
    try {
      await run(ffmpeg, voiceSampleArgs(clip, wav));
    } catch {
      throw new Error('That clip has no sound to take a voice from.');
    }
    const bytes = await fs.readFile(/* turbopackIgnore: true */ wav);
    // Under a second of sound (24 kHz mono 16-bit) is not a voice to go on.
    if (bytes.byteLength < 48000) throw new Error('That clip has no speech to take a voice from.');
    return new Uint8Array(bytes);
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
