/**
 * Server: "Make it 30 s" (clip-extend.ts). A background job renders the new segments one after
 * another — each continuing from the end of the last — then crossfades them into one MP4 kept as
 * a ComfyUI input. In-memory jobs, polled by the client.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from './comfy-input-upload-server';
import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyHistoryEntry,
  type ComfyImageRef,
} from './comfy-utility-graph-server';
import {
  buildExtendBeatsMessages,
  CLIP_EXTEND_MAX_SEGMENTS,
  colorMatchFilter,
  colorMatchGains,
  extendSegmentCount,
  type ChannelStats,
  extendStitchFilter,
  fallbackExtendBeats,
  isWanClipGraph,
  parseExtendBeats,
  patchWanReplayGraph,
  WAN_EXTEND_BLEND_FRAMES,
  type ClipExtendJob,
} from './clip-extend';
import {
  buildLtx25ExtendGraph,
  extendSegmentPrompt,
  LTX25_EXTEND_OVERLAP,
  LTX25_EXTEND_SAVE_NODE,
  LTX25_FACE_RESTORE_NODE,
  LTX25_FPS,
  normalizeSpokenLineTone,
} from './ltx25-renderer';
import { chatCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from './llm-request-options';
import { restoreModelOptions } from './play-checks-readiness-server';
import type { SpokenLineHeat } from './spoken-line';
import { filmTempOsDir, resolveFfmpegBinary } from './video-server-encode';

const jobs = new Map<string, ClipExtendJob>();
const MAX_JOBS = 20;

export function getClipExtendJob(id: string): ClipExtendJob | null {
  const job = jobs.get(id.trim());
  return job ? { ...job } : null;
}

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

type Probe = { frames: number; width: number; height: number; audio: boolean };

async function probe(ffmpeg: string, file: string): Promise<Probe> {
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

async function frameStats(file: string): Promise<ChannelStats> {
  const sharp = (await import('sharp')).default;
  const stats = await sharp(file).stats();
  return {
    mean: stats.channels.slice(0, 3).map(channel => channel.mean),
    std: stats.channels.slice(0, 3).map(channel => channel.stdev),
  };
}

/** One frame of `file` at `seconds` as a PNG. */
async function grabFrame(
  ffmpeg: string,
  file: string,
  seconds: number,
  out: string
): Promise<void> {
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-ss',
    seconds.toFixed(3),
    '-i',
    file,
    '-frames:v',
    '1',
    out,
  ]);
}

/** The piece at 24 fps, `width`×`height`, with a sound track (silence when it has none). */
async function normalizePiece(
  ffmpeg: string,
  source: string,
  out: string,
  size: { width: number; height: number },
  skipFrames = 0,
  colorFilter?: string
): Promise<Probe> {
  const { audio } = await probe(ffmpeg, source);
  const trim = `${skipFrames ? `,trim=start_frame=${skipFrames},setpts=PTS-STARTPTS` : ''}${colorFilter ? `,${colorFilter}` : ''}`;
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
          `aresample=48000${skipFrames ? `,atrim=start=${skipFrames / 24},asetpts=PTS-STARTPTS` : ''}`,
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

async function writeBeats(input: {
  scene: string;
  setting?: string;
  count: number;
  heat: SpokenLineHeat;
  direction?: string;
  llm?: LlmRequestOptions;
}): Promise<string[]> {
  if (resolveRequestLlmEnabled(input.llm)) {
    try {
      const reply = await chatCompletion({
        messages: buildExtendBeatsMessages(input),
        maxTokens: 60 * input.count,
        temperature: 0.8,
        model: resolveRequestLlmModel(input.llm),
        endpoint: resolveRequestLlmEndpoint(input.llm),
        usageContext: { route: 'clip-extend' },
      });
      const beats = parseExtendBeats(reply);
      if (beats.length >= input.count) return beats.slice(0, input.count);
      if (beats.length) {
        return [...beats, ...fallbackExtendBeats(input.count - beats.length, input.heat)];
      }
    } catch {
      // The fallback below keeps the shot going.
    }
  }
  return fallbackExtendBeats(input.count, input.heat);
}

async function readHistoryGraph(
  baseUrl: string,
  promptId: string | undefined
): Promise<Record<string, { class_type?: string; inputs?: Record<string, unknown> }> | null> {
  if (!promptId?.trim()) return null;
  try {
    const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId.trim())}`);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, { prompt?: unknown[] }>;
    const graph = body[promptId.trim()]?.prompt?.[2];
    return graph && typeof graph === 'object' ? (graph as never) : null;
  } catch {
    return null;
  }
}

function firstOutput(entry: ComfyHistoryEntry, node?: string): ComfyImageRef | undefined {
  const outputs = (entry.outputs ?? {}) as Record<string, Record<string, ComfyImageRef[]>>;
  const pick = (out?: Record<string, ComfyImageRef[]>) =>
    [...(out?.images ?? []), ...(out?.videos ?? []), ...(out?.gifs ?? [])].find(
      file => file?.filename
    );
  return node ? pick(outputs[node]) : Object.values(outputs).map(pick).find(Boolean);
}

async function download(baseUrl: string, ref: ComfyImageRef, file: string): Promise<void> {
  const view = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder ?? '',
    type: ref.type || 'output',
  });
  const response = await fetch(`${baseUrl}/view?${view.toString()}`);
  if (!response.ok) throw new Error(`Could not fetch a segment (HTTP ${response.status}).`);
  await fs.writeFile(/* turbopackIgnore: true */ file, Buffer.from(await response.arrayBuffer()));
}

export type ClipExtendInput = {
  clipUrl: string;
  clipPromptId?: string;
  scene: string;
  setting?: string;
  heat?: SpokenLineHeat;
  targetSec?: number;
  direction?: string;
  /** The player's beats, used as written (more beats than needed make it longer, up to the cap). */
  beats?: string[];
  /** A spoken line per beat (same order; empty = no line). LTX parts only — WAN cannot lip-sync. */
  lines?: string[];
  /** How each line is said (same order). */
  tones?: string[];
  /** Who speaks the lines. */
  lead?: 'woman' | 'man';
  comfyUrl?: string;
  requestOrigin?: string;
  userId?: string | null;
  llm?: LlmRequestOptions;
};

/** The player's beats, padded with written ones up to `count`. */
async function resolveBeats(input: ClipExtendInput, count: number): Promise<string[]> {
  const given = (input.beats ?? [])
    .map(beat => beat.trim())
    .filter(Boolean)
    .slice(0, count);
  if (given.length >= count) return given;
  const written = await writeBeats({
    scene: [input.scene, ...given].join(' Then: '),
    setting: input.setting,
    count: count - given.length,
    heat: input.heat ?? 'clean',
    direction: input.direction,
    llm: input.llm,
  });
  return [...given, ...written];
}

/** How many parts the clip needs (the player's beats can ask for more, up to the cap). */
function partCount(
  input: ClipExtendInput,
  clipSec: number,
  wan: boolean,
  wanSegmentSec: number
): { total: number; partSec: number } {
  const segmentSec = wan ? wanSegmentSec : 121 / 24;
  const overlapSec = (wan ? 1 : LTX25_EXTEND_OVERLAP) / 24;
  const needed = extendSegmentCount({
    currentSec: clipSec,
    targetSec: input.targetSec,
    segmentSec,
    overlapSec,
  });
  const asked = (input.beats ?? []).filter(beat => beat.trim()).length;
  return {
    total: Math.min(CLIP_EXTEND_MAX_SEGMENTS, Math.max(needed, asked)),
    partSec: Math.round((segmentSec - overlapSec) * 10) / 10,
  };
}

/** The parts and the beats for them, nothing rendered ("Write the beats"). */
export async function planClipExtend(
  input: ClipExtendInput
): Promise<{ total: number; beats: string[]; partSec: number; engine: 'ltx' | 'wan' }> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.clipUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `extend-plan-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  try {
    const source = path.join(/* turbopackIgnore: true */ dir, 'clip.bin');
    const at24 = path.join(/* turbopackIgnore: true */ dir, 'at24.mp4');
    await fs.writeFile(/* turbopackIgnore: true */ source, fetched.buffer);
    const original = await probe(ffmpeg, source);
    const clip = await normalizePiece(ffmpeg, source, at24, {
      width: original.width & ~1,
      height: original.height & ~1,
    });
    const history = await readHistoryGraph(comfyBaseUrl(input.comfyUrl), input.clipPromptId);
    const wan = Boolean(history && isWanClipGraph(history));
    const { total, partSec } = partCount(input, clip.frames / 24, wan, clip.frames / 24);
    if (!total) throw new Error('This clip is already that long.');
    return {
      total,
      partSec,
      engine: wan ? ('wan' as const) : ('ltx' as const),
      beats: await resolveBeats({ ...input, beats: [] }, total),
    };
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}

/** Start a job; returns at once. Poll with {@link getClipExtendJob}. */
export function startClipExtendJob(input: ClipExtendInput): ClipExtendJob {
  const job: ClipExtendJob = { id: randomUUID(), status: 'running', done: 0, total: 0 };
  jobs.set(job.id, job);
  while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value as string);
  void extendClip(input, progress => Object.assign(job, progress))
    .then(result => Object.assign(job, { status: 'completed', ...result }))
    .catch(error =>
      Object.assign(job, {
        status: 'error',
        error: error instanceof Error ? error.message : 'The extension failed.',
      })
    );
  return { ...job };
}

export async function extendClip(
  input: ClipExtendInput,
  onProgress: (progress: Partial<ClipExtendJob>) => void = () => undefined
): Promise<{ url: string; seconds: number }> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const { fetchFilmShotBytes } = await import('./video-shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.clipUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `extend-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const at = (name: string) => path.join(/* turbopackIgnore: true */ dir, name);
  try {
    await fs.writeFile(/* turbopackIgnore: true */ at('clip.bin'), fetched.buffer);
    const original = await probe(ffmpeg, at('clip.bin'));
    // Even sides for x264; the clip's own size.
    const size = { width: original.width & ~1, height: original.height & ~1 };
    const first = await normalizePiece(ffmpeg, at('clip.bin'), at('piece0.mp4'), size);
    // Colours stay those of the clip's first frame (colorMatchGains).
    await grabFrame(ffmpeg, at('piece0.mp4'), 0, at('reference.png'));
    const reference = await frameStats(at('reference.png'));
    const history = await readHistoryGraph(baseUrl, input.clipPromptId);
    const wan = history && isWanClipGraph(history) ? history : null;
    // WAN segments last as long as the clip did; LTX ones 121 frames (5 s).
    const { total } = partCount(input, first.frames / 24, Boolean(wan), first.frames / 24);
    if (!total) throw new Error('This clip is already that long.');
    onProgress({ total, done: 0 });
    const beats = await resolveBeats(input, total);
    let restoreFace: string | undefined;
    if (!wan) {
      const reactor = await resolveComfyNode(baseUrl, [LTX25_FACE_RESTORE_NODE]);
      const models = restoreModelOptions(reactor?.info);
      restoreFace =
        models.find(name => /codeformer/i.test(name)) ?? models.find(name => /gfpgan/i.test(name));
    }
    const longSide = Math.min(
      1152,
      Math.max(768, Math.round(Math.max(size.width, size.height) / 64) * 64)
    );
    const pieces = [at('piece0.mp4')];
    const lengths = [first.frames];
    const overlaps: number[] = [];
    const seed = Math.floor(Math.random() * 1_000_000_000);
    for (let k = 0; k < total; k += 1) {
      const previous = pieces[k]!;
      const prevFrames = lengths[k]!;
      // The last frame (start / canvas) and, for LTX, the last 17 frames (the guide).
      await run(ffmpeg, [
        '-y',
        '-v',
        'error',
        '-sseof',
        '-0.25',
        '-i',
        previous,
        '-update',
        '1',
        '-frames:v',
        '1',
        at(`last${k}.png`),
      ]);
      const sharp = (await import('sharp')).default;
      const match = colorMatchGains(reference, await frameStats(at(`last${k}.png`)));
      const startBytes = await sharp(at(`last${k}.png`))
        .linear(match.gain, match.offset)
        .png()
        .toBuffer();
      const lastFrame = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(startBytes),
        filename: 'castcut-extend-frame.png',
        mimeType: 'image/png',
      });
      const prefix = 'Castcut-extend';
      let prompt: Record<string, unknown>;
      let saveNode: string | undefined;
      if (wan) {
        const patched = patchWanReplayGraph(wan, {
          lastFrame: lastFrame.name,
          // The clip's own prompt follows; WAN pushed in a little every hop without this.
          beat: `${beats[k]!} The camera stays still; the framing stays exactly as in the first frame.`,
          seed: seed + k * 7,
          prefix,
        });
        if (!patched) throw new Error('Could not replay this clip’s WAN graph.');
        prompt = patched.graph;
        saveNode = patched.saveNode;
      } else {
        await run(ffmpeg, [
          '-y',
          '-v',
          'error',
          '-i',
          previous,
          '-vf',
          `select='gte(n\\,${prevFrames - LTX25_EXTEND_OVERLAP})',setpts=N/${LTX25_FPS}/TB`,
          '-fps_mode',
          'passthrough',
          '-an',
          '-c:v',
          'libx264',
          '-crf',
          '12',
          '-pix_fmt',
          'yuv420p',
          at(`tail${k}.mp4`),
        ]);
        const tail = await uploadComfyInputContent({
          baseUrl,
          bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ at(`tail${k}.mp4`))),
          filename: 'castcut-extend-tail.mp4',
          mimeType: 'video/mp4',
        });
        prompt = buildLtx25ExtendGraph({
          lastFrame: lastFrame.name,
          tailVideo: tail.name,
          prompt: extendSegmentPrompt(beats[k]!, input.setting, {
            line: input.lines?.[k],
            speaker: input.lead === 'man' ? 'He' : 'She',
            tone: normalizeSpokenLineTone(input.tones?.[k]),
          }),
          speaks: Boolean(input.lines?.[k]?.trim()),
          seed: seed + k * 7,
          prefix,
          longSide,
          restoreFace,
        });
        saveNode = LTX25_EXTEND_SAVE_NODE;
      }
      const rendered = await runComfyUtilityGraph<ComfyImageRef>({
        baseUrl,
        label: 'clip-extend',
        // A part waits its turn: six of them must not hold up renders already queued. The timeout
        // covers the wait behind them.
        priority: 'queue',
        timeoutMs: 45 * 60_000,
        prompt,
        read: entry => firstOutput(entry, saveNode) ?? firstOutput(entry),
      });
      if (!rendered.result)
        throw new Error('A segment finished without a clip — check the ComfyUI log.');
      await download(baseUrl, rendered.result, at(`seg${k}.bin`));
      // The segment's colours matched to the clip's first frame, read from its middle frame.
      const raw = await probe(ffmpeg, at(`seg${k}.bin`)).catch(() => null);
      const segMatch = await grabFrame(
        ffmpeg,
        at(`seg${k}.bin`),
        raw ? raw.frames / 2 / 24 : 1,
        at(`mid${k}.png`)
      )
        .then(() => frameStats(at(`mid${k}.png`)))
        .then(stats => colorMatchFilter(colorMatchGains(reference, stats)))
        .catch(() => undefined);
      // A WAN segment starts on the previous last frame: drop it; LTX keeps its overlap to blend.
      const piece = await normalizePiece(
        ffmpeg,
        at(`seg${k}.bin`),
        at(`piece${k + 1}.mp4`),
        size,
        wan ? 1 : 0,
        segMatch
      );
      pieces.push(at(`piece${k + 1}.mp4`));
      lengths.push(piece.frames);
      overlaps.push(wan ? WAN_EXTEND_BLEND_FRAMES : LTX25_EXTEND_OVERLAP);
      onProgress({ done: k + 1 });
    }
    const filter = extendStitchFilter(lengths, overlaps);
    const last = lengths.length - 1;
    await run(ffmpeg, [
      '-y',
      ...pieces.flatMap(piece => ['-i', piece]),
      '-filter_complex',
      filter,
      '-map',
      `[v${last}]`,
      '-map',
      `[a${last}]`,
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
      at('extended.mp4'),
    ]);
    const done = await probe(ffmpeg, at('extended.mp4'));
    const kept = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ at('extended.mp4'))),
      filename: 'castcut-extended.mp4',
      mimeType: 'video/mp4',
    });
    return {
      url: `/api/comfyui/view?${new URLSearchParams({ filename: kept.name, type: 'input' }).toString()}`,
      seconds: Math.round((done.frames / 24) * 10) / 10,
    };
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
