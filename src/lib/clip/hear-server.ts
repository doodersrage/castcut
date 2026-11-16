/**
 * Hear a finished clip (Whisper, CastcutTranscribe on ComfyUI): did a talking clip say its line,
 * and only it — and does a clip with no line keep quiet? Make longer has heard its parts this way
 * since 2026-10-30 (9e92e97a, bbbd8d60); single Animate clips never were, and the flagship film's
 * talking shots kept MiniMax-H3's made-up words (2026-11-16).
 */

import 'server-only';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import {
  COMFY_TRANSCRIBE_NODE,
  comfyBaseUrl,
  resolveComfyNode,
  transcribeInComfy,
} from '../comfyui/comfy-utility-graph-server';
import { fetchFilmShotBytes } from '../video/shot-fetch';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';
import { lineHeardWrong, loudestWindow, WORDLESS_SPEECH_DB, wordlessSpeaks } from './extend';
import { singleLineSaidTwice, speechBursts } from '../audio/line-fit';

/** The loudest 50 ms of a file's sound (dBFS); null without sound. */
export async function loudestDb(ffmpeg: string, file: string): Promise<number | null> {
  const rate = 16000;
  const pcm = await new Promise<Buffer>(resolve => {
    const child = spawn(
      ffmpeg,
      ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk as Buffer));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
  if (pcm.length < rate / 10) return null;
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  return loudestWindow(samples, rate, 0.05, 0.05).db;
}

const HEAR_RATE = 16000;

/** A file's sound as mono samples (−1…1); null without sound. */
async function monoSamples(ffmpeg: string, file: string): Promise<Float32Array | null> {
  const pcm = await new Promise<Buffer>(resolve => {
    const child = spawn(
      ffmpeg,
      ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(HEAR_RATE), '-f', 's16le', '-'],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk as Buffer));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
  if (pcm.length < HEAR_RATE / 10) return null;
  const ints = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  return Float32Array.from(ints, value => value / 32768);
}

export type ClipHearing = {
  /** False when it couldn't be heard (no Whisper node, no ffmpeg, the fetch failed). */
  heard: boolean;
  /** What Whisper heard ('' quiet; absent when a quiet clip needed no hearing). */
  transcript?: string;
  /** A line not said as written (something else, or more), or words where none belong. */
  wrong: boolean;
};

export async function hearClip(input: {
  url: string;
  entryId?: string;
  /** The line it should say; empty: it should say nothing. */
  line: string;
  comfyUrl?: string;
  userId?: string | null;
  requestOrigin?: string;
}): Promise<ClipHearing> {
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  if (!(await resolveComfyNode(baseUrl, [COMFY_TRANSCRIBE_NODE]))) {
    return { heard: false, wrong: false };
  }
  const fetched = await fetchFilmShotBytes({
    url: input.url,
    entryId: input.entryId,
    userId: input.userId,
    requestOrigin: input.requestOrigin,
  }).catch(() => null);
  if (!fetched?.buffer.byteLength) return { heard: false, wrong: false };
  const line = input.line.trim();
  let loudest: number | null = null;
  let saidTwice = false;
  if (line) {
    // A one-sentence line said twice can be heard as once by Whisper: its sound says so.
    const ffmpeg = await resolveFfmpegBinary();
    if (ffmpeg) {
      const file = path.join(filmTempOsDir(), `castcut-hear-${randomUUID()}.mp4`);
      try {
        await fs.writeFile(/* turbopackIgnore: true */ file, fetched.buffer);
        const samples = await monoSamples(ffmpeg, file);
        saidTwice = samples ? singleLineSaidTwice(speechBursts(samples, HEAR_RATE), line) : false;
      } finally {
        await fs.rm(/* turbopackIgnore: true */ file, { force: true }).catch(() => undefined);
      }
    }
  }
  if (!line) {
    // Loudness first: a quiet clip holds no voice and needs no ComfyUI call.
    const ffmpeg = await resolveFfmpegBinary();
    if (!ffmpeg) return { heard: false, wrong: false };
    const file = path.join(filmTempOsDir(), `castcut-hear-${randomUUID()}.mp4`);
    try {
      await fs.writeFile(/* turbopackIgnore: true */ file, fetched.buffer);
      loudest = await loudestDb(ffmpeg, file);
    } finally {
      await fs.rm(/* turbopackIgnore: true */ file, { force: true }).catch(() => undefined);
    }
    if (loudest === null || !(loudest > WORDLESS_SPEECH_DB)) return { heard: true, wrong: false };
  }
  const uploaded = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(fetched.buffer),
    filename: 'castcut-clip-hear.mp4',
    mimeType: 'video/mp4',
  }).catch(() => null);
  if (!uploaded) return { heard: false, wrong: false };
  const transcript = await transcribeInComfy(baseUrl, uploaded.name);
  if (transcript === null) return { heard: false, wrong: false };
  return {
    heard: true,
    transcript,
    wrong: line
      ? saidTwice || lineHeardWrong(transcript, line)
      : wordlessSpeaks(transcript, loudest ?? 0),
  };
}
