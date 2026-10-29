/**
 * Server: "Make it 30 s" (clip-extend.ts). A background job renders the new segments one after
 * another — each continuing from the end of the last — then crossfades them into one MP4 kept as
 * a ComfyUI input. In-memory jobs, polled by the client.
 */

import { promises as fs } from 'node:fs';
import { writeClipSource } from './clip-source-server';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyHistoryEntry,
  type ComfyImageRef,
} from '../comfyui/comfy-utility-graph-server';
import {
  buildExtendBeatsMessages,
  CLIP_EXTEND_MAX_SEGMENTS,
  colorMatchFilter,
  colorMatchGains,
  laplacianVariance,
  pickStartSharpenIndex,
  WAN_START_SHARPEN_STEPS,
  extendSegmentCount,
  type ChannelStats,
  extendStitchFilter,
  FACE_ANCHOR_STEP,
  FACE_ANCHOR_WINDOW,
  fallbackExtendBeats,
  pickAnchorFrame,
  withPartAction,
  isWanClipGraph,
  parseExtendBeats,
  patchWanReplayGraph,
  WAN_EXTEND_BLEND_FRAMES,
  type ClipExtendJob,
} from './extend';
import {
  buildLtx25ExtendGraph,
  extendSegmentPrompt,
  LTX25_EXTEND_OVERLAP,
  LTX25_EXTEND_SAVE_NODE,
  LTX25_FACE_RESTORE_NODE,
  LTX25_FPS,
  normalizeSpokenLineTone,
} from '../video/ltx25-renderer';
import {
  h3PartPrompt,
  H3_PART_FRAMES,
  H3_REF_FILES,
  H3_REF_NODE,
  withH3References,
  isH3ClipGraph,
  patchH3ReplayGraph,
} from '../engine/h3-renderer';
import { chatCompletion } from '../llm/client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from '../llm/request-options';
import { restoreModelOptions } from '../play/checks-readiness-server';
import type { SpokenLineHeat } from '../audio/spoken-line';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';

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

async function frameDetail(input: Buffer | string): Promise<number> {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true });
  return laplacianVariance(data, info.width, info.height);
}

/**
 * A WAN hop's start frame sharpened back toward the clip's own detail (WAN_START_SHARPEN_STEPS):
 * each part starts from the last one's softest frame, and the softening otherwise compounds.
 */
async function sharpenStartFrame(png: Buffer, target: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  if ((await frameDetail(png)) >= target) return png;
  const tries: Buffer[] = [];
  const detail: number[] = [];
  for (const m2 of WAN_START_SHARPEN_STEPS) {
    const out = await sharp(png).sharpen({ sigma: 1, m1: 0, m2 }).png().toBuffer();
    tries.push(out);
    detail.push(await frameDetail(out));
    if (detail[detail.length - 1]! > target) break;
  }
  const chosen = pickStartSharpenIndex(target, detail);
  return chosen < 0 ? png : tries[chosen]!;
}

/**
 * One frame of `file` at `seconds` as a PNG. The seek is on the output side (decode up to it):
 * ffmpeg cannot seek into an animated WebP — WAN's output — and an input-side `-ss` there exited 0
 * with no frame written, so every WAN segment's colour match silently fell away.
 */
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
async function normalizePiece(
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

/** Beats from the scene and direction alone (M11 T2: the Animate sheet, no clip yet). */
export async function writeClipBeats(input: {
  scene: string;
  setting?: string;
  count: number;
  heat: SpokenLineHeat;
  direction?: string;
  llm?: LlmRequestOptions;
}): Promise<string[]> {
  return writeBeats(input);
}

async function writeBeats(input: {
  scene: string;
  setting?: string;
  count: number;
  heat: SpokenLineHeat;
  direction?: string;
  /** A talking clip: who speaks (the beats keep them in place). */
  talking?: { speaker: 'She' | 'He' };
  llm?: LlmRequestOptions;
}): Promise<string[]> {
  const fallback = (count: number) => fallbackExtendBeats(count, input.heat, input.talking);
  if (resolveRequestLlmEnabled(input.llm)) {
    try {
      const reply = await chatCompletion({
        messages: buildExtendBeatsMessages({ ...input, talking: Boolean(input.talking) }),
        maxTokens: 60 * input.count,
        temperature: 0.8,
        model: resolveRequestLlmModel(input.llm),
        endpoint: resolveRequestLlmEndpoint(input.llm),
        usageContext: { route: 'clip-extend' },
      });
      const beats = parseExtendBeats(reply);
      if (beats.length >= input.count) return beats.slice(0, input.count);
      if (beats.length) {
        return [...beats, ...fallback(input.count - beats.length)];
      }
    } catch {
      // The fallback below keeps the shot going.
    }
  }
  return fallback(input.count);
}

/**
 * The frame of `piece` (24 fps, `frames` long) the next part starts from (M11 T4): the candidates
 * in its last second scored against the reference face, the best picked (pickAnchorFrame). Null
 * when the face check can't run here (no FaceAnalysis, no face in the reference).
 */
async function faceAnchorFrame(input: {
  ffmpeg: string;
  piece: string;
  frames: number;
  referenceUrl: string;
  baseUrl: string;
  comfyUrl?: string;
  at: (name: string) => string;
  tag: string;
}): Promise<{ index: number; similarity: number | null } | null> {
  const { measureFaceMatchInComfy, FaceMatchNoFaceError } = await import('../face/match-server');
  const last = input.frames - 1;
  const indexes: number[] = [];
  for (let back = 0; back < FACE_ANCHOR_WINDOW && last - back >= 0; back += FACE_ANCHOR_STEP) {
    indexes.push(last - back);
  }
  const candidates: Array<{ index: number; similarity: number | null }> = [];
  for (const index of indexes) {
    const file = input.at(`anchor-${input.tag}-${index}.png`);
    await run(input.ffmpeg, [
      '-y',
      '-v',
      'error',
      '-i',
      input.piece,
      '-vf',
      `select=eq(n\\,${index})`,
      '-frames:v',
      '1',
      file,
    ]);
    const uploaded = await uploadComfyInputContent({
      baseUrl: input.baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ file)),
      filename: 'castcut-extend-anchor.png',
      mimeType: 'image/png',
    });
    const result = await measureFaceMatchInComfy({
      referenceUrl: input.referenceUrl,
      imageUrl: `/api/comfyui/view?${new URLSearchParams({ filename: uploaded.name, type: 'input' }).toString()}`,
      comfyUrl: input.comfyUrl,
      timeoutMs: 60_000,
    }).catch(error => {
      if (error instanceof FaceMatchNoFaceError) return null;
      throw error;
    });
    if (result && !result.available) return null;
    candidates.push({ index, similarity: result?.available ? result.similarity : null });
  }
  return pickAnchorFrame(candidates, last);
}

/** `piece` cut to its first `frames` frames, video and sound (a part ending on its anchor frame). */
async function cutPiece(ffmpeg: string, piece: string, frames: number, out: string): Promise<void> {
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-i',
    piece,
    '-vf',
    `trim=end_frame=${frames},setpts=PTS-STARTPTS`,
    '-af',
    `atrim=end=${frames / 24},asetpts=PTS-STARTPTS`,
    '-c:v',
    'libx264',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    out,
  ]);
}

/**
 * The Cast's pictures in ComfyUI's input folder for H3's reference model (M11) — none when this
 * ComfyUI lacks the node, the reference transformer or its Turbo LoRA, or a picture can't be read.
 */
async function h3ReferencePictures(
  baseUrl: string,
  input: ClipExtendInput
): Promise<Array<{ image: string; shows: string }>> {
  try {
    const [node, unets, loras] = await Promise.all([
      resolveComfyNode(baseUrl, [H3_REF_NODE]),
      fetch(`${baseUrl}/object_info/UNETLoader`).then(response => response.json()),
      fetch(`${baseUrl}/object_info/LoraLoaderModelOnly`).then(response => response.json()),
    ]);
    const names = (info: unknown, loader: string, field: string): string[] => {
      const options = (
        info as Record<string, { input?: { required?: Record<string, unknown[]> } }>
      )?.[loader]?.input?.required?.[field]?.[0];
      return Array.isArray(options) ? options.map(String) : [];
    };
    if (
      !node ||
      !names(unets, 'UNETLoader', 'unet_name').includes(H3_REF_FILES.transformer) ||
      !names(loras, 'LoraLoaderModelOnly', 'lora_name').includes(H3_REF_FILES.turboLora)
    ) {
      return [];
    }
    const { fetchFilmShotBytes } = await import('../video/shot-fetch');
    const pictures: Array<{ image: string; shows: string }> = [];
    for (const reference of (input.references ?? []).slice(0, 4)) {
      const fetched = await fetchFilmShotBytes({
        url: reference.url,
        requestOrigin: input.requestOrigin,
        userId: input.userId,
      });
      const uploaded = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(fetched.buffer),
        filename: 'castcut-extend-reference.png',
        mimeType: fetched.contentType || 'image/png',
      });
      pictures.push({ image: uploaded.name, shows: reference.shows });
    }
    return pictures;
  } catch {
    return [];
  }
}

type Graph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

async function readHistoryGraph(
  baseUrl: string,
  promptId: string | undefined
): Promise<Graph | null> {
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
  /** Make it this many seconds longer instead of up to `targetSec` (Cut's "Make longer"). */
  extendBySec?: number;
  direction?: string;
  /** The player's beats, used as written (more beats than needed make it longer, up to the cap). */
  beats?: string[];
  /** Each part's length in seconds (same order; 0 = the engine's own): shorter is trimmed. */
  partSeconds?: number[];
  /**
   * The Cast's pictures (its look plate, …) with what each shows (M11): H3 parts render on H3's
   * reference model with them, when this ComfyUI has it, and `look` says her appearance.
   */
  references?: Array<{ url: string; shows: string }>;
  look?: string;
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
  // In place (M11): a part left empty is written, the ones given keep their place.
  const given = Array.from({ length: count }, (_, k) => input.beats?.[k]?.trim() ?? '');
  const missing = given.flatMap((beat, k) => (beat ? [] : [k]));
  if (!missing.length) return given;
  const written = await writeBeats({
    scene: [input.scene, ...given.filter(Boolean)].join(' Then: '),
    setting: input.setting,
    count: missing.length,
    heat: input.heat ?? 'clean',
    direction: input.direction,
    // Dialogue parts (a line each): the speaker stays where they are.
    ...(input.lines?.some(line => line.trim())
      ? { talking: { speaker: input.lead === 'man' ? ('He' as const) : ('She' as const) } }
      : {}),
    llm: input.llm,
  });
  missing.forEach((k, at) => {
    given[k] = written[at] ?? '';
  });
  return given;
}

export type ClipExtendEngine = 'ltx' | 'wan' | 'h3';

/** Which engine renders the parts: the clip's own WAN or H3 graph replayed, else LTX-2.5. */
function partEngine(history: Graph | null): ClipExtendEngine {
  if (history && isWanClipGraph(history)) return 'wan';
  if (history && isH3ClipGraph(history)) return 'h3';
  return 'ltx';
}

/** How many parts the clip needs (the player's beats can ask for more, up to the cap). */
function partCount(
  input: ClipExtendInput,
  clipSec: number,
  engine: ClipExtendEngine,
  wanSegmentSec: number
): { total: number; partSec: number } {
  // WAN parts last as long as the clip did; H3 ones its own shot (~5.2 s); LTX ones 121 frames.
  const segmentSec =
    engine === 'wan' ? wanSegmentSec : engine === 'h3' ? H3_PART_FRAMES / 24 : 121 / 24;
  // WAN and H3 parts start on the previous last frame (dropped); LTX's overlap is blended.
  const overlapSec = (engine === 'ltx' ? LTX25_EXTEND_OVERLAP : 1) / 24;
  const needed = extendSegmentCount({
    currentSec: clipSec,
    targetSec:
      input.extendBySec && input.extendBySec > 0 ? clipSec + input.extendBySec : input.targetSec,
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
): Promise<{ total: number; beats: string[]; partSec: number; engine: ClipExtendEngine }> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const { fetchFilmShotBytes } = await import('../video/shot-fetch');
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
    await writeClipSource(ffmpeg, fetched.buffer, source);
    const original = await probe(ffmpeg, source);
    const clip = await normalizePiece(ffmpeg, source, at24, {
      width: original.width & ~1,
      height: original.height & ~1,
    });
    const history = await readHistoryGraph(comfyBaseUrl(input.comfyUrl), input.clipPromptId);
    const engine = partEngine(history);
    const { total, partSec } = partCount(input, clip.frames / 24, engine, clip.frames / 24);
    if (!total) throw new Error('This clip is already that long.');
    return {
      total,
      partSec,
      engine,
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
): Promise<{ url: string; seconds: number; faces?: Array<number | null> }> {
  const ffmpeg = await resolveFfmpegBinary();
  if (!ffmpeg) throw new Error('ffmpeg is not available on this server.');
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const { fetchFilmShotBytes } = await import('../video/shot-fetch');
  const fetched = await fetchFilmShotBytes({
    url: input.clipUrl,
    requestOrigin: input.requestOrigin,
    userId: input.userId,
  });
  const dir = path.join(/* turbopackIgnore: true */ filmTempOsDir(), `extend-${randomUUID()}`);
  await fs.mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  const at = (name: string) => path.join(/* turbopackIgnore: true */ dir, name);
  try {
    await writeClipSource(ffmpeg, fetched.buffer, at('clip.bin'));
    const original = await probe(ffmpeg, at('clip.bin'));
    // Even sides for x264; the clip's own size.
    const size = { width: original.width & ~1, height: original.height & ~1 };
    const first = await normalizePiece(ffmpeg, at('clip.bin'), at('piece0.mp4'), size);
    // The first clip's first frame: the detail parts are sharpened back toward, and the face they
    // keep (each part's colours are matched at its seam instead).
    await grabFrame(ffmpeg, at('piece0.mp4'), 0, at('reference.png'));
    const referenceDetail = await frameDetail(at('reference.png'));
    const history = await readHistoryGraph(baseUrl, input.clipPromptId);
    const engine = partEngine(history);
    const wan = engine === 'wan' ? history : null;
    const h3 = engine === 'h3' ? history : null;
    // H3 parts on the reference model, with the Cast's pictures (M11), when this ComfyUI has it.
    const h3Pictures =
      h3 && input.references?.length ? await h3ReferencePictures(baseUrl, input) : [];
    const { total } = partCount(input, first.frames / 24, engine, first.frames / 24);
    if (!total) throw new Error('This clip is already that long.');
    onProgress({ total, done: 0 });
    const beats = await resolveBeats(input, total);
    let restoreFace: string | undefined;
    if (engine === 'ltx') {
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
    // The Cast's face as the first clip shows it (M11 T4): each part after the first starts from
    // the frame of the part before that matches it best. Off when the face check can't run.
    let faceReference: string | null = null;
    try {
      const uploaded = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ at('reference.png'))),
        filename: 'castcut-extend-face.png',
        mimeType: 'image/png',
      });
      faceReference = `/api/comfyui/view?${new URLSearchParams({ filename: uploaded.name, type: 'input' }).toString()}`;
    } catch {
      faceReference = null;
    }
    const faces: Array<number | null> = [];
    for (let k = 0; k < total; k += 1) {
      // A generated part (never the player's own clip) cut at its best face frame.
      if (k > 0 && faceReference) {
        const anchor = await faceAnchorFrame({
          ffmpeg,
          piece: pieces[k]!,
          frames: lengths[k]!,
          referenceUrl: faceReference,
          baseUrl,
          comfyUrl: input.comfyUrl,
          at,
          tag: String(k),
        }).catch(() => null);
        if (!anchor) {
          faceReference = null;
        } else {
          faces.push(anchor.similarity);
          // Never shorter than what blends into the part before it, plus a second.
          if (anchor.index < lengths[k]! - 1 && anchor.index + 1 > overlaps[k - 1]! + 24) {
            await cutPiece(ffmpeg, pieces[k]!, anchor.index + 1, at(`piece${k}-cut.mp4`));
            pieces[k] = at(`piece${k}-cut.mp4`);
            lengths[k] = anchor.index + 1;
          }
        }
      }
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
      // The start frame as the part before ends — its colours untouched. Matching it to the first
      // frame's colours recoloured whatever the shot had become (a wide of sand vs a close-up of an
      // orange swimsuit), and each seam jumped in colour and saturation.
      const matched = await fs.readFile(/* turbopackIgnore: true */ at(`last${k}.png`));
      // Sharpened back toward the first clip's detail on WAN and H3 (M11 T3): each part starts from
      // the last one's softest frame, and the softening compounds.
      const startBytes = wan || h3 ? await sharpenStartFrame(matched, referenceDetail) : matched;
      const lastFrame = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(startBytes),
        filename: 'castcut-extend-frame.png',
        mimeType: 'image/png',
      });
      const prefix = 'Castcut-extend';
      let prompt: Record<string, unknown>;
      let saveNode: string | undefined;
      if (h3) {
        const clipPrompt = Object.values(h3).find(
          node => node?.class_type === 'MiniMaxH3ImageToVideo'
        )?.inputs?.prompt;
        const patched = patchH3ReplayGraph(h3, {
          lastFrame: lastFrame.name,
          // The clip's prompt with this part's beat as its action (M11 T1): the first clip's action
          // stays in the first clip.
          prompt: h3PartPrompt(
            typeof clipPrompt === 'string'
              ? (withPartAction(clipPrompt, beats[k]!) ?? clipPrompt)
              : '',
            {
              beat: beats[k]!,
              place: input.setting,
              line: input.lines?.[k],
              speaker: input.lead === 'man' ? 'He' : 'She',
            }
          ),
          seed: seed + k * 7,
          prefix,
        });
        if (!patched) throw new Error('Could not replay this clip’s MiniMax-H3 graph.');
        prompt = h3Pictures.length
          ? (withH3References(patched.graph, {
              pictures: [
                {
                  image: lastFrame.name,
                  shows:
                    'the first frame: the shot as it is now, which the video starts from exactly',
                },
                ...h3Pictures,
              ],
              look: input.look,
            }) ?? patched.graph)
          : patched.graph;
        saveNode = patched.saveNode;
      } else if (wan) {
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
      // The segment's colours matched at the seam: its first frame shows what the frame it started
      // from shows (WAN / H3: that frame; LTX: the tail's first frame), so the difference is only
      // the engine's colour shift — taken out of the whole part, and the seam stays the same colour.
      const seamFrame = engine === 'ltx' ? at(`tailfirst${k}.png`) : at(`last${k}.png`);
      if (engine === 'ltx')
        await grabFrame(ffmpeg, at(`tail${k}.mp4`), 0, seamFrame).catch(() => undefined);
      const segMatch = await grabFrame(ffmpeg, at(`seg${k}.bin`), 0, at(`first${k}.png`))
        .then(async () =>
          colorMatchFilter(
            colorMatchGains(await frameStats(seamFrame), await frameStats(at(`first${k}.png`)))
          )
        )
        .catch(() => undefined);
      // A WAN or H3 segment starts on the previous last frame: drop it; LTX keeps its overlap to
      // blend.
      const fromLastFrame = engine !== 'ltx';
      const overlap = fromLastFrame ? WAN_EXTEND_BLEND_FRAMES : LTX25_EXTEND_OVERLAP;
      // A part asked to be shorter (M11 T2) keeps its first seconds plus what blends into the
      // part before; the next part starts from its new last frame.
      const asked = input.partSeconds?.[k];
      const piece = await normalizePiece(
        ffmpeg,
        at(`seg${k}.bin`),
        at(`piece${k + 1}.mp4`),
        size,
        fromLastFrame ? 1 : 0,
        segMatch,
        asked && asked > 0 ? Math.round(asked * 24) + overlap : undefined
      );
      pieces.push(at(`piece${k + 1}.mp4`));
      lengths.push(piece.frames);
      overlaps.push(overlap);
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
      ...(faces.length ? { faces } : {}),
    };
  } finally {
    await fs
      .rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
