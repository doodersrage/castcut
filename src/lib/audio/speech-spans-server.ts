/**
 * Where each talking clip's line starts and ends, for Cut: its first speech, and the first pause by
 * which the whole line has been heard (Whisper, CastcutTranscribe on ComfyUI) — not the clip's last
 * sound, which can be H3 talking on after its line (the flagship's 1C, 2026-11-18).
 */

import 'server-only';

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import {
  COMFY_TRANSCRIBE_NODE,
  comfyBaseUrl,
  resolveComfyNode,
  transcribeInComfy,
} from '../comfyui/comfy-utility-graph-server';
import {
  heardWholeLine,
  speechBursts,
  speechPauses,
  speechResumesAt,
  type LineSpan,
} from './line-fit';
import { fetchFilmShotBytes } from '../video/shot-fetch';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';

const RATE = 16000;

function monoFromBytes(ffmpeg: string, bytes: Uint8Array): Promise<Float32Array | null> {
  return new Promise(resolve => {
    const child = spawn(
      ffmpeg,
      ['-v', 'error', '-i', 'pipe:0', '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'],
      { stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk as Buffer));
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const pcm = Buffer.concat(chunks);
      if (pcm.length < RATE / 10) return resolve(null);
      const ints = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
      resolve(Float32Array.from(ints, value => value / 32768));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(Buffer.from(bytes));
  });
}

export type SpeechSpan = LineSpan;

/** The most pauses heard for one line (each a short transcription). */
const MAX_PAUSES_HEARD = 6;

/** The clip up to a time, as a file ComfyUI can load. */
function clipUpTo(ffmpeg: string, source: string, endSec: number, out: string): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(
      ffmpeg,
      [
        '-v',
        'error',
        '-y',
        '-i',
        source,
        '-t',
        endSec.toFixed(2),
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        out,
      ],
      { stdio: 'ignore' }
    );
    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
  });
}

/**
 * The first pause by which the clip has said all of its line, heard; null when it can't be heard
 * (no ComfyUI or no transcribe node) or never is — then the span is first sound to last, as before.
 */
async function pauseAfterLine(input: {
  ffmpeg: string;
  bytes: Uint8Array;
  pauses: readonly number[];
  line: string;
}): Promise<number | null> {
  const baseUrl = comfyBaseUrl();
  if (!(await resolveComfyNode(baseUrl, [COMFY_TRANSCRIBE_NODE]))) return null;
  const dir = filmTempOsDir();
  const source = path.join(dir, `castcut-line-${randomUUID()}.mp4`);
  try {
    await fs.writeFile(/* turbopackIgnore: true */ source, input.bytes);
    // The clip's last sound last: when that's the first heard whole, it ends there.
    for (const pause of input.pauses) {
      const part = path.join(dir, `castcut-line-${randomUUID()}.mp4`);
      try {
        if (!(await clipUpTo(input.ffmpeg, source, pause + 0.12, part))) return null;
        const uploaded = await uploadComfyInputContent({
          baseUrl,
          bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ part)),
          filename: 'castcut-line-part.mp4',
          mimeType: 'video/mp4',
        }).catch(() => null);
        if (!uploaded) return null;
        const transcript = await transcribeInComfy(baseUrl, uploaded.name);
        if (transcript === null) return null;
        if (heardWholeLine(transcript, input.line)) return pause;
      } finally {
        await fs.rm(/* turbopackIgnore: true */ part, { force: true }).catch(() => undefined);
      }
    }
    return null;
  } finally {
    await fs.rm(/* turbopackIgnore: true */ source, { force: true }).catch(() => undefined);
  }
}

export async function speechSpans(
  shots: ReadonlyArray<{ key: string; url: string; entryId?: string; spoken?: string }>,
  context: { userId?: string | null; requestOrigin?: string }
): Promise<Record<string, SpeechSpan | null>> {
  const ffmpeg = await resolveFfmpegBinary();
  const out: Record<string, SpeechSpan | null> = {};
  if (!ffmpeg) return out;
  for (const shot of shots) {
    const fetched = await fetchFilmShotBytes({
      url: shot.url,
      entryId: shot.entryId,
      userId: context.userId,
      requestOrigin: context.requestOrigin,
    }).catch(() => null);
    const samples = fetched?.buffer.byteLength
      ? await monoFromBytes(ffmpeg, new Uint8Array(fetched.buffer))
      : null;
    const bursts = samples ? speechBursts(samples, RATE) : [];
    if (!samples || !bursts.length) {
      out[shot.key] = null;
      continue;
    }
    const startSec = bursts[0]!.startSec;
    const pauses = speechPauses(samples, RATE);
    const lastSec = pauses[pauses.length - 1] ?? bursts[bursts.length - 1]!.endSec;
    // More than one place it could end: heard, from the earliest.
    const heardEnd =
      shot.spoken?.trim() && pauses.length > 1
        ? await pauseAfterLine({
            ffmpeg,
            bytes: new Uint8Array(fetched!.buffer),
            pauses: pauses.slice(0, MAX_PAUSES_HEARD - 1).concat(lastSec),
            line: shot.spoken,
          }).catch(() => null)
        : null;
    // Ended by hearing, before its last sound: where it talks on, the shot must end before.
    const resumeSec =
      heardEnd !== null && heardEnd < lastSec
        ? speechResumesAt(samples, RATE, heardEnd + 0.04)
        : null;
    out[shot.key] = {
      startSec,
      endSec: heardEnd ?? lastSec,
      ...(resumeSec !== null ? { resumeSec } : {}),
    };
  }
  return out;
}
