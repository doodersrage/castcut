/**
 * A Cast member's voice for MiniMax-H3 (M11 T16): ~1.6 s of them speaking — picture and sound — cut
 * from a talking clip where it speaks most, at 512 px, in ComfyUI's input. H3's reference model
 * takes it as <Video 1> / <Audio 1> (engine/h3-renderer.ts withH3VoiceAnchor): parts of a longer
 * clip, and new clips, then speak in that voice.
 */
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import { loudestWindow, VOICE_ANCHOR_MIN_DB } from '../clip/extend';
import { H3_VOICE_CLIP_FRAMES } from '../engine/h3-renderer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';
import { VOICE_SHIFT } from './voice-server';

/** AAC bitrate of the clip (one encode, transparent at 256 kb/s). */
const AUDIO_BITRATE = '256k';

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

/** The voice clip of `clip` (a local file) uploaded to ComfyUI; null when it barely speaks. */
export async function voiceAnchorClip(input: {
  ffmpeg: string;
  baseUrl: string;
  clip: string;
  /** Where to write the cut (a temp file the caller cleans up). */
  out: string;
}): Promise<string | null> {
  const rate = 16000;
  const pcm = await new Promise<Buffer>(resolve => {
    const child = spawn(
      input.ffmpeg,
      ['-v', 'error', '-i', input.clip, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk as Buffer));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
  if (pcm.length < rate) return null;
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const loudest = loudestWindow(samples, rate, H3_VOICE_CLIP_FRAMES / 24);
  if (loudest.db < VOICE_ANCHOR_MIN_DB) return null;
  await run(input.ffmpeg, [
    '-y',
    '-v',
    'error',
    '-ss',
    loudest.start.toFixed(3),
    '-i',
    input.clip,
    '-frames:v',
    String(H3_VOICE_CLIP_FRAMES),
    '-vf',
    'scale=-2:512',
    '-c:v',
    'libx264',
    '-crf',
    '12',
    '-c:a',
    'aac',
    '-b:a',
    AUDIO_BITRATE,
    input.out,
  ]);
  const uploaded = await uploadComfyInputContent({
    baseUrl: input.baseUrl,
    bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ input.out)),
    filename: 'castcut-voice-anchor.mp4',
    mimeType: 'video/mp4',
    keepCopy: true,
  });
  return uploaded.name;
}

async function inTempDir<T>(fn: (at: (name: string) => string) => Promise<T>): Promise<T> {
  const dir = path.join(
    /* turbopackIgnore: true */ filmTempOsDir(),
    `voice-anchor-${randomUUID()}`
  );
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    return await fn(name => path.join(/* turbopackIgnore: true */ dir, name));
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

/** "Use this voice" from a talking clip (or an audition): its voice clip as well as its sample. */
export async function voiceAnchorFromClipUrl(input: {
  clipUrl: string;
  baseUrl: string;
  requestOrigin?: string;
  userId?: string | null;
}): Promise<string | null> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) return null;
  const { fetchFilmShotBytes } = await import('../video/shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.clipUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  return inTempDir(async at => {
    await fs.writeFile(/* turbopackIgnore: true */ at('clip.mp4'), fetched.buffer);
    return voiceAnchorClip({
      ffmpeg,
      baseUrl: input.baseUrl,
      clip: at('clip.mp4'),
      out: at('voice.mp4'),
    });
  });
}

/** A kept voice clip with its sound pitched as its sample was (deeper / higher); same picture. */
export async function shiftVoiceAnchor(input: {
  baseUrl: string;
  clip: string;
  direction: keyof typeof VOICE_SHIFT;
}): Promise<string> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const params = new URLSearchParams({ filename: input.clip, type: 'input' });
  const response = await fetch(`${input.baseUrl}/view?${params.toString()}`);
  if (!response.ok) throw new Error('That voice clip is gone from ComfyUI — keep a voice again.');
  const ratio = VOICE_SHIFT[input.direction];
  return inTempDir(async at => {
    await fs.writeFile(
      /* turbopackIgnore: true */ at('in.mp4'),
      Buffer.from(await response.arrayBuffer())
    );
    await run(ffmpeg, [
      '-y',
      '-v',
      'error',
      '-i',
      at('in.mp4'),
      '-af',
      `aresample=48000,asetrate=48000*${ratio},aresample=48000,atempo=${(1 / ratio).toFixed(4)}`,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      AUDIO_BITRATE,
      at('out.mp4'),
    ]);
    const uploaded = await uploadComfyInputContent({
      baseUrl: input.baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ at('out.mp4'))),
      filename: 'castcut-voice-anchor.mp4',
      mimeType: 'video/mp4',
      keepCopy: true,
    });
    return uploaded.name;
  });
}
