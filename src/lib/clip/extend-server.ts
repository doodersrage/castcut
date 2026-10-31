/**
 * Server: "Make it 30 s" (clip-extend.ts). A background job renders the new segments one after
 * another — each continuing from the end of the last — then crossfades them into one MP4 kept as
 * a ComfyUI input. In-memory jobs, polled by the client.
 */

import { promises as fs } from 'node:fs';
import { writeClipSource } from './clip-source-server';
import {
  frameStats,
  grabFrame,
  normalizePiece,
  PIECE_AUDIO_BITRATE,
  probe,
} from './clip-pieces-server';
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
  extendStitchFilter,
  groupH3Blocks,
  FACE_ANCHOR_STEP,
  FACE_ANCHOR_WINDOW,
  fallbackExtendBeats,
  pickAnchorFrame,
  renumberH3Pictures,
  withPartAction,
  isWanClipGraph,
  parseExtendBeats,
  patchWanReplayGraph,
  WAN_EXTEND_BLEND_FRAMES,
  type ClipExtendJob,
  parseShotInventory,
  lineHeardWrong,
  loudestWindow,
  wordlessSpeaks,
  WORDLESS_SPEECH_DB,
  SHOT_INVENTORY_SYSTEM,
  type ShotInventory,
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
  h3GridFrames,
  H3_REF_FILES,
  H3_REF_NODE,
  withH3References,
  withH3TimedLine,
  withH3VoiceAnchor,
  isH3ClipGraph,
  patchH3ReplayGraph,
} from '../engine/h3-renderer';
import { chatCompletion, visionCompletion } from '../llm/client';
import { voiceAnchorClip } from '../cast/voice-anchor-server';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestLlmModel,
  type LlmRequestOptions,
} from '../llm/request-options';
import { restoreModelOptions } from '../play/checks-readiness-server';
import type { SpokenLineHeat } from '../audio/spoken-line';
import { filmTempOsDir, resolveFfmpegBinary } from '../video/server-encode';
import { buildStillUpscaleGraph, STILL_UPSCALE_SAVE_NODE } from '../still/upscale';
import { buildRelightGraph, RELIGHT_SAVE_NODE, relightSize } from '../edit/relight';
import { pickRelightCheckpoint } from '../edit/relight-server';
import { countDuoStillInComfy } from '../checks/duo-still-check-server';
import { CLIP_FINISH_MODELS } from './finish';

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

async function frameDetail(input: Buffer | string): Promise<number> {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true });
  return laplacianVariance(data, info.width, info.height);
}

/**
 * Keyframes for a longer H3 clip (M11 T14): the next part's start edited from this one — "the same
 * photo a few seconds later: <beat>" on the Rapid AIO edit checkpoint (Sketch's plain edit) — and
 * checked for a second face or extra hands (duo-still-check), redrawn on a new seed up to
 * KEYFRAME_TRIES times. Live (2026-10-29, the beach clip, 3 × 5 s): the joins landed on their
 * keyframes (a change of 0.3 against 1.8 between frames), texture held flat over the clip, and
 * each part kept H3's own sound. Null when the edit checkpoint is not installed.
 */
const KEYFRAME_TRIES = 3;
/** What the frame shows the person holding (the vision model; nothing when it can't say). */
async function describeShot(png: Buffer, llm?: LlmRequestOptions): Promise<ShotInventory> {
  try {
    const { resolveGalleryVisionTarget } = await import('../gallery/vision-review');
    const target = await resolveGalleryVisionTarget({ llm });
    const reply = await visionCompletion({
      ...target,
      systemPrompt: SHOT_INVENTORY_SYSTEM,
      textPrompt: 'What is the person holding?',
      imageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
      maxTokens: 600,
      temperature: 0.1,
      usageContext: { route: 'clip-extend' },
    });
    return parseShotInventory(reply);
  } catch {
    return { held: [] };
  }
}

/**
 * Whether `after` (the same place moments later) shows an object, light or part of the place that
 * `before` does not — the vision model with both pictures (null when it can't say). Measured on
 * live keyframes: 4 of 5 right; its miss called a streetlight's glow new (one redraw too many).
 */
async function addsSomething(
  before: Buffer,
  after: Buffer,
  llm?: LlmRequestOptions
): Promise<boolean | null> {
  try {
    const { resolveGalleryVisionTarget } = await import('../gallery/vision-review');
    const target = await resolveGalleryVisionTarget({ llm });
    const reply = await visionCompletion({
      ...target,
      systemPrompt: 'Answer with one word: yes or no.',
      textPrompt:
        "The second picture is the same place a few seconds after the first. Ignoring the person's pose and what they hold, does the second picture show any object, lamp, light, sign, smoke or piece of the place that is not in the first?",
      imageDataUrl: `data:image/png;base64,${before.toString('base64')}`,
      extraImageDataUrls: [`data:image/png;base64,${after.toString('base64')}`],
      maxTokens: 300,
      temperature: 0,
      usageContext: { route: 'clip-extend' },
    });
    const answer = reply
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim()
      .toLowerCase();
    if (/^yes\b/.test(answer)) return true;
    if (/^no\b/.test(answer)) return false;
    return null;
  } catch {
    return null;
  }
}

/** Whether the person in `png` still holds `item` (null when the vision model can't say). */
async function stillHolds(
  png: Buffer,
  item: string,
  llm?: LlmRequestOptions
): Promise<boolean | null> {
  try {
    const { resolveGalleryVisionTarget } = await import('../gallery/vision-review');
    const target = await resolveGalleryVisionTarget({ llm });
    const reply = await visionCompletion({
      ...target,
      systemPrompt: 'Answer with one word: yes or no.',
      textPrompt: `Is the person holding ${item.replace(/\s+in (his|her|their) (left|right) hand$/i, '')} in a hand?`,
      imageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
      maxTokens: 300,
      temperature: 0,
      usageContext: { route: 'clip-extend' },
    });
    const answer = reply
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim()
      .toLowerCase();
    if (/^yes\b/.test(answer)) return true;
    if (/^no\b/.test(answer)) return false;
    return null;
  } catch {
    return null;
  }
}

/** Share of a picture's cells that changed past which a keyframe has left the place. */
const PLACE_CHANGED = 0.5;

/** The share of a 24 × 24 grid whose brightness changed a lot between two pictures (0–1). */
async function pictureChanged(a: Buffer, b: Buffer): Promise<number> {
  const sharp = (await import('sharp')).default;
  const grid = (png: Buffer) =>
    sharp(png).greyscale().resize(24, 24, { fit: 'fill' }).raw().toBuffer();
  const [x, y] = await Promise.all([grid(a), grid(b)]);
  let changed = 0;
  for (let i = 0; i < x.length; i += 1) if (Math.abs(x[i]! - y[i]!) > 40) changed += 1;
  return changed / x.length;
}

async function keyframeEditor(
  baseUrl: string,
  llm?: LlmRequestOptions
): Promise<{
  edit: (
    png: Buffer,
    beat: string,
    lead: 'woman' | 'man',
    seed: number,
    place?: string,
    held?: readonly string[]
  ) => Promise<Buffer>;
} | null> {
  const response = await fetch(`${baseUrl}/models/checkpoints`, {
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const names = response?.ok ? ((await response.json()) as unknown) : [];
  const checkpoint = pickRelightCheckpoint(
    Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : []
  );
  if (!checkpoint) return null;
  const sharp = (await import('sharp')).default;
  return {
    async edit(png, beat, lead, seed, place, held = []) {
      const meta = await sharp(png).metadata();
      const width = meta.width ?? 1024;
      const height = meta.height ?? 1024;
      const uploaded = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(png),
        filename: 'castcut-extend-keyframe-from.png',
        mimeType: 'image/png',
      });
      const their = lead === 'man' ? 'his' : 'her';
      const action = beat.trim().replace(/[.\s]+$/, '');
      const setting = place?.trim().replace(/[.\s]+$/, '');
      const where = setting ? ` (${setting})` : '';
      const holding = held.length
        ? ` ${lead === 'man' ? 'He' : 'She'} is still holding ${held.join(' and ')}, in the same hand.`
        : '';
      let best: { png: Buffer; extra: number } | null = null;
      for (let attempt = 0; attempt < KEYFRAME_TRIES; attempt += 1) {
        const run = await runComfyUtilityGraph<ComfyImageRef>({
          baseUrl,
          label: 'extend-keyframe',
          priority: 'queue',
          timeoutMs: 15 * 60_000,
          prompt: buildRelightGraph({
            checkpoint,
            image: uploaded.name,
            prompt: `The same photo a few seconds later: ${action}. Keep the same ${lead} exactly — ${their} face, hair and clothes — and the same place${where}, light and camera framing: the location does not change, only ${their} pose does, and nothing new appears — no smoke, mist or new light.${holding} Photorealistic, sharp, natural skin texture; one person, two arms, two hands.`,
            ...relightSize(width, height),
            seed: seed + attempt * 101,
            prefix: 'Castcut-extend-keyframe',
            noLora: true,
          }),
          read: entry =>
            (entry.outputs?.[RELIGHT_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined)
              ?.images?.[0],
        });
        if (!run.result) continue;
        const view = await fetch(
          `${baseUrl}/view?${new URLSearchParams({
            filename: run.result.filename,
            subfolder: run.result.subfolder ?? '',
            type: run.result.type || 'output',
          }).toString()}`,
          { signal: AbortSignal.timeout(60_000) }
        );
        if (!view.ok) continue;
        const drawn = await sharp(Buffer.from(await view.arrayBuffer()))
          .resize(width, height, { kernel: 'lanczos3', fit: 'cover' })
          .png()
          .toBuffer();
        // A second face or more than two hands (an edit can add an arm): draw it again.
        const viewUrl = `/api/comfyui/view?${new URLSearchParams({
          filename: run.result.filename,
          subfolder: run.result.subfolder ?? '',
          type: run.result.type || 'output',
        }).toString()}`;
        const counted = await countDuoStillInComfy({ imageUrl: viewUrl, comfyUrl: baseUrl }).catch(
          () => null
        );
        const counts = counted?.available ? counted.counts : null;
        // A new place, not a new pose (a beat that "glanced around the room" moved her indoors):
        // most of the picture changed — a redraw, ranked last.
        const moved = await pictureChanged(png, drawn);
        // What she held is still in her hand (live: an "adjust the collar" keyframe dropped her
        // phone, and a later one raised it again) — asked of the vision model; unknown counts as kept.
        const dropped = held.length
          ? (await Promise.all(held.map(item => stillHolds(drawn, item, llm)))).filter(
              kept => kept === false
            ).length
          : 0;
        // Nothing new in the place (live: a beat that lit up "string lamps above" hung a
        // chandelier that stayed for the rest of the clip).
        const added = (await addsSomething(png, drawn, llm)) ? 4 : 0;
        const extra =
          dropped * 5 +
          added +
          (counts
            ? Math.max(0, (counts.faces ?? 1) - 1) + Math.max(0, (counts.hands ?? 2) - 2)
            : 0) +
          (moved > PLACE_CHANGED ? 10 : 0);
        if (!best || extra < best.extra) best = { png: drawn, extra };
        if (extra === 0) break;
      }
      if (!best) throw new Error('A keyframe could not be drawn — check the ComfyUI log.');
      return best.png;
    },
  };
}

/** How large SeedVR2 restores a start frame (its long side, at most), before it is set back. */
const RESTORE_LONG_SIDE = 2048;
/** How much of the restored frame goes into the start frame. */
const RESTORE_MIX = 0.5;

/**
 * A part's start frame with its fine detail restored (SeedVR2, the one-step restore Sharpen &
 * smooth and Upscale use, at 2× and set back to its size): each part starts from a frame of the
 * last, and over five or six parts skin went waxy and hair soft (live, a 30 s H3 chain) — an
 * unsharp mask brings back edges but not texture. Null when SeedVR2 is not installed or fails
 * (the frame is then sharpened as before).
 */
async function restoreStartFrame(
  baseUrl: string,
  png: Buffer,
  target: number
): Promise<Buffer | null> {
  try {
    // Only once the frame has lost detail against the first clip's: restored every part, the
    // restorer's own texture compounded (sand turned blotchy, skin oily by the fourth part).
    if ((await frameDetail(png)) >= target) return png;
    const sharp = (await import('sharp')).default;
    const meta = await sharp(png).metadata();
    if (!meta.width || !meta.height) return null;
    const unets = await fetch(`${baseUrl}/object_info/UNETLoader`).then(response =>
      response.json()
    );
    const names = (unets as Record<string, { input?: { required?: Record<string, unknown[]> } }>)
      ?.UNETLoader?.input?.required?.unet_name?.[0];
    if (!Array.isArray(names) || !names.includes(CLIP_FINISH_MODELS.seedvr)) return null;
    const scale = Math.min(2, RESTORE_LONG_SIDE / Math.max(meta.width, meta.height));
    if (scale <= 1) return null;
    const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
    const uploaded = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(png),
      filename: 'castcut-extend-restore.png',
      mimeType: 'image/png',
    });
    const graph = buildStillUpscaleGraph({
      image: uploaded.name,
      width: even(meta.width),
      height: even(meta.height),
      seed: 7,
      prefix: 'Castcut-extend-restore',
    });
    // A preview (ComfyUI's temp folder), not a saved picture: one per part would pile up.
    graph[STILL_UPSCALE_SAVE_NODE] = {
      class_type: 'PreviewImage',
      inputs: {
        images: (graph[STILL_UPSCALE_SAVE_NODE] as { inputs: { images: unknown } }).inputs.images,
      },
    };
    const run = await runComfyUtilityGraph<ComfyImageRef>({
      baseUrl,
      label: 'extend-restore',
      priority: 'queue',
      timeoutMs: 10 * 60_000,
      prompt: graph,
      read: entry =>
        (entry.outputs?.[STILL_UPSCALE_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined)
          ?.images?.[0],
    });
    if (!run.result) return null;
    const view = await fetch(
      `${baseUrl}/view?${new URLSearchParams({
        filename: run.result.filename,
        subfolder: run.result.subfolder ?? '',
        type: run.result.type || 'temp',
      }).toString()}`,
      { signal: AbortSignal.timeout(60_000) }
    );
    if (!view.ok) return null;
    const restored = await sharp(Buffer.from(await view.arrayBuffer()))
      .resize(meta.width, meta.height, { kernel: 'lanczos3' })
      .png()
      .toBuffer();
    // Half restored, half as it was: enough detail back, little of the restorer's own.
    const half = await sharp(restored).ensureAlpha(RESTORE_MIX).png().toBuffer();
    return await sharp(png)
      .composite([{ input: half, blend: 'over' }])
      .png()
      .toBuffer();
  } catch (error) {
    console.warn('[extend] start-frame restore failed; sharpening instead:', error);
    return null;
  }
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
  /** What the first frame shows them holding. */
  held?: readonly string[];
  /** What the first frame shows, in a sentence. */
  shows?: string;
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
    '-b:a',
    PIECE_AUDIO_BITRATE,
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
): Promise<{ pictures: Array<{ image: string; shows: string }>; look?: string }> {
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
      return { pictures: [] };
    }
    const { fetchFilmShotBytes } = await import('../video/shot-fetch');
    const pictures: Array<{ image: string; shows: string }> = [];
    const kept: number[] = [];
    for (const [index, reference] of (input.references ?? []).slice(0, 4).entries()) {
      // One that can't be had (a dressed plate since cleared) leaves the others in use.
      try {
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
        kept.push(index);
      } catch {
        continue;
      }
    }
    return { pictures, look: renumberH3Pictures(input.look, kept) };
  } catch {
    return { pictures: [] };
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

/**
 * A clip whose later parts are silent given the place's sound: LTX-2.5 writes the soundtrack for
 * the whole clip (dub-server.ts, the picture unchanged), and it comes in under the parts — the
 * first clip keeps its own sound, crossfaded over SOUND_FADE seconds. Without it (the dub fails),
 * quiet room tone. Returns the file to keep.
 */
async function soundLongParts(
  ffmpeg: string,
  input: {
    clip: string;
    firstSec: number;
    hadSound: boolean;
    out: string;
    scene: string;
    place?: string;
    heat?: SpokenLineHeat;
    lead?: 'woman' | 'man';
    comfyUrl?: string;
  }
): Promise<string> {
  const SOUND_FADE = 0.4;
  let sound: string;
  try {
    const { dubClipWithVoice } = await import('./dub-server');
    const url = await dubClipWithVoice({
      clipUrl: `data:video/mp4;base64,${(await fs.readFile(/* turbopackIgnore: true */ input.clip)).toString('base64')}`,
      scene: input.scene,
      place: input.place,
      heat:
        input.heat === 'explicit' || input.heat === 'sensual' || input.heat === 'flirty'
          ? input.heat
          : 'clean',
      lead: input.lead,
      comfyUrl: input.comfyUrl,
    });
    const view = await fetch(
      `${comfyBaseUrl(input.comfyUrl)}${url.replace(/^\/api\/comfyui/, '')}`,
      { signal: AbortSignal.timeout(120_000) }
    );
    if (!view.ok) throw new Error(`HTTP ${view.status}`);
    sound = `${input.out}.dub.mp4`;
    await fs.writeFile(/* turbopackIgnore: true */ sound, Buffer.from(await view.arrayBuffer()));
  } catch (error) {
    console.warn('[extend] sound for the long parts failed; room tone instead:', error);
    sound = 'anoisesrc=color=brown:amplitude=0.004:sample_rate=48000';
  }
  const tone = !sound.endsWith('.mp4');
  const head = (input.firstSec + SOUND_FADE).toFixed(3);
  const filter = input.hadSound
    ? `[0:a]atrim=end=${head},asetpts=PTS-STARTPTS[a0];[1:a]atrim=start=${input.firstSec.toFixed(3)},asetpts=PTS-STARTPTS[a1];[a0][a1]acrossfade=d=${SOUND_FADE}[a]`
    : `[1:a]anull[a]`;
  await run(ffmpeg, [
    '-y',
    '-i',
    input.clip,
    ...(tone ? ['-f', 'lavfi', '-i', sound] : ['-i', sound]),
    '-filter_complex',
    filter,
    '-map',
    '0:v',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    PIECE_AUDIO_BITRATE,
    '-shortest',
    '-movflags',
    '+faststart',
    input.out,
  ]);
  return input.out;
}

/** Castcut's Whisper node (comfyui-nodes/castcut 1.8.0). */
const TRANSCRIBE_NODE = 'CastcutTranscribe';

/**
 * What a rendered part (a local MP4) says, transcribed on ComfyUI by CastcutTranscribe; null when
 * the node is missing or the check fails (the part is then kept as it is).
 */
async function hearPart(baseUrl: string, file: string): Promise<string | null> {
  if (!(await resolveComfyNode(baseUrl, [TRANSCRIBE_NODE]))) return null;
  const uploaded = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ file)),
    filename: 'castcut-extend-hear.mp4',
    mimeType: 'video/mp4',
  });
  const run = await runComfyUtilityGraph<string>({
    baseUrl,
    label: 'clip-extend-hear',
    priority: 'front',
    timeoutMs: 5 * 60_000,
    prompt: {
      hear1: { class_type: 'LoadVideo', inputs: { file: uploaded.name } },
      hear2: { class_type: 'GetVideoComponents', inputs: { video: ['hear1', 0] } },
      hear3: {
        class_type: TRANSCRIBE_NODE,
        inputs: { audio: ['hear2', 1], model: 'openai/whisper-base', language: 'en' },
      },
    },
    read: entry => {
      const text = (entry.outputs?.hear3 as { castcut_text?: unknown[] } | undefined)
        ?.castcut_text?.[0];
      return typeof text === 'string' ? text : undefined;
    },
  });
  return typeof run.result === 'string' ? run.result : null;
}

/** The loudest 50 ms of a file's sound (dBFS); null without sound. */
async function loudestDb(ffmpeg: string, file: string): Promise<number | null> {
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

/**
 * Whether a part was heard saying the wrong thing: a talking part not its `line` (or more), a
 * wordless one any words at all. False when it can't be heard.
 */
async function partHeardWrong(
  ffmpeg: string,
  baseUrl: string,
  file: string,
  line: string
): Promise<boolean> {
  if (line) {
    const heard = await hearPart(baseUrl, file);
    return heard !== null && lineHeardWrong(heard, line);
  }
  // Loudness first: a quiet part holds no voice, and needs no ComfyUI call.
  const loudest = await loudestDb(ffmpeg, file);
  if (loudest === null || !(loudest > WORDLESS_SPEECH_DB)) return false;
  const heard = await hearPart(baseUrl, file);
  return heard !== null && wordlessSpeaks(heard, loudest);
}

/** How far a wordless part that still speaks after its retries is turned down (dB). */
const WORDLESS_DUCK_DB = -24;

/** Times a part with a hard cut is rendered again, and what a cut is. */
const CUT_RETRIES = 2;
const CUT_RATIO = 7;
const CUT_MIN_CHANGE = 30;

/**
 * Whether a clip cuts to a new shot: one frame-to-frame change (mean brightness difference on a
 * 64 × 64 grey copy) at least CUT_RATIO times the clip's median and CUT_MIN_CHANGE outright.
 * Calibrated on the live clips: cuts to a new shot changed 34–60, a fast hand at most 28.
 */
async function hasHardCut(ffmpeg: string, file: string): Promise<boolean> {
  const raw = await new Promise<Buffer>(resolve => {
    const child = spawn(
      ffmpeg,
      ['-v', 'error', '-i', file, '-vf', 'scale=64:64,format=gray', '-f', 'rawvideo', '-'],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk as Buffer));
    child.on('error', () => resolve(Buffer.alloc(0)));
    child.on('close', () => resolve(Buffer.concat(chunks)));
  });
  const size = 64 * 64;
  const frames = Math.floor(raw.length / size);
  if (frames < 3) return false;
  const changes: number[] = [];
  for (let f = 1; f < frames; f += 1) {
    let sum = 0;
    for (let i = 0; i < size; i += 1)
      sum += Math.abs(raw[f * size + i]! - raw[(f - 1) * size + i]!);
    changes.push(sum / size);
  }
  const sorted = [...changes].sort((a, b) => a - b);
  const median = Math.max(0.5, sorted[Math.floor(sorted.length / 2)]!);
  return changes.some(change => change >= CUT_MIN_CHANGE && change >= median * CUT_RATIO);
}

/** The graph with every noise seed replaced (a part rendered again). */
function reseeded(graph: Record<string, unknown>, seed: number): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(graph)) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  for (const node of Object.values(copy)) {
    if (node?.class_type === 'RandomNoise' && node.inputs) node.inputs.noise_seed = seed % 2 ** 32;
  }
  return copy;
}

/** A file's mean sound level (dBFS), or null without sound or a reading. */
async function meanVolume(ffmpeg: string, file: string): Promise<number | null> {
  return (await volumeLevels(ffmpeg, file))?.mean ?? null;
}

/** A file's mean and peak sound levels (dBFS), or null without sound or a reading. */
async function volumeLevels(
  ffmpeg: string,
  file: string
): Promise<{ mean: number; peak: number } | null> {
  const log = await new Promise<string>(resolve => {
    const child = spawn(ffmpeg, ['-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(stderr));
  });
  const mean = log.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const peak = log.match(/max_volume:\s*(-?[\d.]+) dB/);
  return mean ? { mean: Number(mean[1]), peak: peak ? Number(peak[1]) : 0 } : null;
}

/**
 * How far a part's sound is brought toward the first clip's level (dB), and what is silence: a
 * quiet keyframed part came out near −50 dB against −14.
 */
const LEVEL_GAIN = { min: -6, max: 20 };
const SILENT_DB = -65;

/** Headroom a raised part keeps under full scale (dB): its peak lands at −1 dBFS at most. */
const PEAK_CEILING_DB = -1;

/**
 * `file`'s sound brought to `target` dBFS (within LEVEL_GAIN), in place; silence left alone.
 * Plain gain, no further than its peak allows — a limiter (alimiter) here cost a part's speech
 * 0.14–0.33 of DNSMOS SIG, the main "robotic" step in the chain (live, 2026-10-30).
 */
async function levelPieceAudio(
  ffmpeg: string,
  file: string,
  target: number | null,
  scratch: string
): Promise<void> {
  if (target === null || target < SILENT_DB) return;
  const levels = await volumeLevels(ffmpeg, file);
  if (!levels || levels.mean < SILENT_DB) return;
  const gain = Math.min(
    LEVEL_GAIN.max,
    PEAK_CEILING_DB - levels.peak,
    Math.max(LEVEL_GAIN.min, target - levels.mean)
  );
  if (Math.abs(gain) < 1.5) return;
  await run(ffmpeg, [
    '-y',
    '-v',
    'error',
    '-i',
    file,
    '-af',
    `volume=${gain.toFixed(1)}dB`,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    PIECE_AUDIO_BITRATE,
    scratch,
  ]);
  await fs.rename(/* turbopackIgnore: true */ scratch, /* turbopackIgnore: true */ file);
}

/** How many of an H3 part's last decoded frames are kept lossless, and their preview node. */
const TAIL_FRAMES = 30;
const TAIL_PREVIEW_NODE = 'castcut_tail_preview';

/**
 * The part's last TAIL_FRAMES decoded frames, previewed (PNGs in ComfyUI's temp folder) beside the
 * saved MP4: the next part starts from one of these — the face anchor's pick is in its last
 * second — and not from the MP4 compressed twice over (ComfyUI's save, then the piece), a
 * generation lost at every hop.
 */
function withTailPreview(graph: Record<string, unknown>, frames: number): void {
  const nodes = graph as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
  const create = Object.values(nodes).find(node => node?.class_type === 'CreateVideo');
  const images = create?.inputs?.images;
  if (!Array.isArray(images)) return;
  nodes.castcut_tail = {
    class_type: 'ImageFromBatch',
    inputs: { image: images, batch_index: frames - TAIL_FRAMES, length: TAIL_FRAMES },
  };
  nodes[TAIL_PREVIEW_NODE] = {
    class_type: 'PreviewImage',
    inputs: { images: ['castcut_tail', 0] },
  };
}

/**
 * One lossless tail frame as the piece has it — the piece's size, its colour match — written to
 * `out`. False when it cannot be had (the caller takes the piece's frame instead).
 */
async function tailFrame(
  baseUrl: string,
  ffmpeg: string,
  file: ComfyImageRef,
  size: { width: number; height: number },
  match: string | undefined,
  out: string
): Promise<boolean> {
  try {
    const source = `${out}.src.png`;
    await download(baseUrl, file, source);
    await run(ffmpeg, [
      '-y',
      '-v',
      'error',
      '-i',
      source,
      '-vf',
      `scale=${size.width}:${size.height}:flags=lanczos,setsar=1${match ? `,${match}` : ''}`,
      '-frames:v',
      '1',
      out,
    ]);
    return true;
  } catch {
    return false;
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
  /** The Cast's kept voice clip (ComfyUI input): talking H3 parts speak in it (M11 T16). */
  voiceClip?: string;
  /** Or, with no clip (a voice from the player's recording), its sample alone (ComfyUI input). */
  voiceSample?: string;
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
async function resolveBeats(
  input: ClipExtendInput,
  count: number,
  shot: ShotInventory = { held: [] }
): Promise<string[]> {
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
    held: shot.held,
    shows: shot.shows,
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
    const end = path.join(/* turbopackIgnore: true */ dir, 'end.png');
    await grabFrame(ffmpeg, at24, Math.max(0, (clip.frames - 1) / 24), end);
    const shot = await describeShot(await fs.readFile(/* turbopackIgnore: true */ end), input.llm);
    return {
      total,
      partSec,
      engine,
      beats: await resolveBeats({ ...input, beats: [] }, total, shot),
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
    const { pictures: h3Pictures, look: h3Look } =
      h3 && input.references?.length
        ? await h3ReferencePictures(baseUrl, input)
        : { pictures: [], look: undefined };
    const { total } = partCount(input, first.frames / 24, engine, first.frames / 24);
    if (!total) throw new Error('This clip is already that long.');
    onProgress({ total, done: 0 });
    // What she holds at the end of the clip, kept in hand by the beats, keyframes and parts.
    await grabFrame(ffmpeg, at('piece0.mp4'), Math.max(0, (first.frames - 1) / 24), at('end0.png'));
    const shot = await describeShot(
      await fs.readFile(/* turbopackIgnore: true */ at('end0.png')),
      input.llm
    );
    const { held } = shot;
    const beats = await resolveBeats(input, total, shot);
    // Talking H3 parts speak in the first clip's voice (M11 T16): each part on its own invented a
    // new one, the last two "someone else entirely".
    // The first clip's voice only when it speaks a line (its prompt quotes one): a wordless
    // clip's wind and street sound passed for speech and the parts spoke in a 113 Hz rumble (live).
    const firstSpeaks = h3
      ? /\bsays\b[^"]{0,24}"[^"]+"/.test(
          String(
            Object.values(h3).find(node => node?.class_type === 'MiniMaxH3ImageToVideo')?.inputs
              ?.prompt ?? ''
          )
        )
      : false;
    let voiceAnchor =
      h3 && input.lines?.some(line => line?.trim())
        ? input.voiceClip?.trim() ||
          (firstSpeaks && !input.voiceSample?.trim()
            ? await voiceAnchorClip({
                ffmpeg,
                baseUrl,
                clip: at('piece0.mp4'),
                out: at('voice.mp4'),
              }).catch(() => null)
            : null)
        : null;
    // Wordless H3 parts render long (M11 T13): their beats as timed blocks, up to 15 s a part —
    // fewer hops, and each hop is where detail went. With a spoken line, parts stay H3's own
    // length with its own sound.
    // Keyframes first (M11 T14): each part runs between two clean stills, the next edited from
    // the last, so no part starts from a generated frame. Long parts when there is no edit model.
    // CASTCUT_EXTEND_KEYFRAMES=off: chained parts (an operator's switch, and the long-part test).
    const keyframes =
      h3 && process.env.CASTCUT_EXTEND_KEYFRAMES !== 'off'
        ? await keyframeEditor(baseUrl, input.llm)
        : null;
    const groups =
      h3 && !keyframes && !input.lines?.some(line => line?.trim())
        ? groupH3Blocks(beats, input.partSeconds)
        : null;
    const renders = groups?.length ?? total;
    if (groups) onProgress({ total: renders, done: 0 });
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
    // An H3 part's last TAIL_FRAMES decoded frames as ComfyUI previews (lossless), by piece: the
    // next part starts from one of them rather than from the twice-compressed piece.
    let firstLoudness: number | null | undefined;
    const tails: Array<{ files: ComfyImageRef[]; from: number; match?: string } | undefined> = [];
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
    for (let k = 0; k < renders; k += 1) {
      const group = groups?.[k];
      // The part's frames: its blocks and the start frame it drops (H3's own shot otherwise).
      const partFrames = group ? h3GridFrames(Math.round(group.seconds * 24) + 1) : H3_PART_FRAMES;
      // A generated part (never the player's own clip) cut at its best face frame.
      if (k > 0 && faceReference && !keyframes) {
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
      // The last frame (start / canvas): from the part's lossless tail when it has it, else from
      // the piece; and, for LTX, the last 17 frames (the guide).
      const tail = tails[k];
      const tailFile = tail?.files[prevFrames - 1 + 1 - tail.from];
      // A keyframed part starts on the keyframe the last one ended on (a clean still).
      if (keyframes && k > 0) await fs.copyFile(at(`keyframe${k}.png`), at(`last${k}.png`));
      const fromTail =
        (keyframes && k > 0) ||
        (tailFile
          ? await tailFrame(baseUrl, ffmpeg, tailFile, size, tail?.match, at(`last${k}.png`))
          : false);
      if (!fromTail)
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
      // Restored (SeedVR2) where it can be, else sharpened back toward the first clip's detail.
      const startBytes =
        (wan || h3) && !(keyframes && k > 0)
          ? ((await restoreStartFrame(baseUrl, matched, referenceDetail)) ??
            (await sharpenStartFrame(matched, referenceDetail)))
          : matched;
      const lastFrame = await uploadComfyInputContent({
        baseUrl,
        bytes: new Uint8Array(startBytes),
        filename: 'castcut-extend-frame.png',
        mimeType: 'image/png',
      });
      const prefix = 'Castcut-extend';
      let prompt: Record<string, unknown>;
      let saveNode: string | undefined;
      // The keyframe this part ends on: the start edited a few seconds on, by its beat.
      let endFrame: string | undefined;
      if (keyframes) {
        const png = await keyframes.edit(
          await fs.readFile(/* turbopackIgnore: true */ at(`last${k}.png`)),
          beats[k]!,
          input.lead === 'man' ? 'man' : 'woman',
          seed + k * 13,
          input.setting,
          held
        );
        await fs.writeFile(/* turbopackIgnore: true */ at(`keyframe${k + 1}.png`), png);
        endFrame = (
          await uploadComfyInputContent({
            baseUrl,
            bytes: new Uint8Array(png),
            filename: 'castcut-extend-keyframe.png',
            mimeType: 'image/png',
          })
        ).name;
      }
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
              ? (withPartAction(clipPrompt, group ? 'as timed above' : beats[k]!) ?? clipPrompt)
              : '',
            {
              beat: group ? '' : beats[k]!,
              place: input.setting,
              line: group ? undefined : input.lines?.[k],
              wordless: Boolean(
                !group && !input.lines?.[k]?.trim() && input.lines?.some(line => line?.trim())
              ),
              speaker: input.lead === 'man' ? 'He' : 'She',
              held,
              ...(group ? { blocks: group.blocks } : {}),
            }
          ),
          seed: seed + k * 7,
          prefix,
          ...(group ? { frames: partFrames, silent: true } : {}),
          ...(endFrame ? { endFrame } : {}),
        });
        if (!patched) throw new Error('Could not replay this clip’s MiniMax-H3 graph.');
        const voiceAudio = voiceAnchor ? undefined : input.voiceSample?.trim();
        const speaks = Boolean((voiceAnchor || voiceAudio) && !group && input.lines?.[k]?.trim());
        const anchored = speaks
          ? withH3VoiceAnchor(patched.graph, {
              ...(voiceAnchor ? { voiceClip: voiceAnchor } : { voiceAudio }),
              pictures: h3Pictures,
              look: h3Look,
              who: input.lead === 'man' ? 'He' : 'She',
            })
          : null;
        // The reference model has no end frame of its own: without a voice to keep, keyframed
        // parts keep the first/last-frame one (a talking part pins its frames with guides).
        // A talking part with no voice to keep (the plain model): its line timed all the same.
        const timed = (graph: typeof patched.graph) =>
          !group && input.lines?.[k]?.trim()
            ? withH3TimedLine(graph, input.lead === 'man' ? 'He' : 'She')
            : graph;
        prompt = anchored
          ? anchored
          : h3Pictures.length && !endFrame
            ? timed(
                withH3References(patched.graph, {
                  pictures: [
                    {
                      image: lastFrame.name,
                      shows:
                        'the first frame: the shot as it is now, which the video starts from exactly',
                    },
                    ...h3Pictures,
                  ],
                  look: h3Look,
                }) ?? patched.graph
              )
            : timed(patched.graph);
        saveNode = patched.saveNode;
        if (!endFrame) withTailPreview(prompt, partFrames);
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
      let tailFiles: ComfyImageRef[] | undefined;
      const rendered = await runComfyUtilityGraph<ComfyImageRef>({
        baseUrl,
        label: 'clip-extend',
        // A part waits its turn: six of them must not hold up renders already queued. The timeout
        // covers the wait behind them.
        priority: 'queue',
        timeoutMs: 45 * 60_000,
        prompt,
        read: entry => {
          tailFiles = (
            entry.outputs?.[TAIL_PREVIEW_NODE] as { images?: ComfyImageRef[] } | undefined
          )?.images;
          return firstOutput(entry, saveNode) ?? firstOutput(entry);
        },
      });
      if (!rendered.result)
        throw new Error('A segment finished without a clip — check the ComfyUI log.');
      await download(baseUrl, rendered.result, at(`seg${k}.bin`));
      // H3 can cut to a new shot mid-part (a wide of the sea between two close keyframes, live), or
      // say more than its line (about 1 in 10 voice-anchored parts, M11 T19 — heard by Castcut's
      // transcribe node when ComfyUI has it): rendered again on another seed, up to CUT_RETRIES.
      const partLine = h3 && !group ? (input.lines?.[k]?.trim() ?? '') : '';
      // A wordless part of a talking clip: H3's plain model made up garbled speech in 2 of 3 live
      // ("Nobody speaks" in the prompt notwithstanding) — heard like a talking part.
      const wordlessPart = Boolean(
        h3 && !group && !partLine && input.lines?.some(line => line?.trim())
      );
      // Heard still saying something other than its line after the retries: not a voice to keep.
      let lineWrong = false;
      for (let retry = 1; h3 && retry <= CUT_RETRIES + 1; retry += 1) {
        const cut = await hasHardCut(ffmpeg, at(`seg${k}.bin`));
        const wrong =
          !cut && (partLine || wordlessPart)
            ? await partHeardWrong(ffmpeg, baseUrl, at(`seg${k}.bin`), partLine).catch(() => false)
            : false;
        if (!cut && !wrong) break;
        if (retry > CUT_RETRIES) {
          lineWrong = wrong;
          break;
        }
        const again = await runComfyUtilityGraph<ComfyImageRef>({
          baseUrl,
          label: 'clip-extend',
          priority: 'queue',
          timeoutMs: 45 * 60_000,
          prompt: reseeded(prompt, seed + k * 7 + retry * 1009),
          read: entry => {
            tailFiles = (
              entry.outputs?.[TAIL_PREVIEW_NODE] as { images?: ComfyImageRef[] } | undefined
            )?.images;
            return firstOutput(entry, saveNode) ?? firstOutput(entry);
          },
        });
        if (!again.result) break;
        await download(baseUrl, again.result, at(`seg${k}.bin`));
      }
      // A wordless part still speaking after its retries: turned down to the room, so it says
      // nothing you can hear instead of garble (its sounds go down with it).
      if (wordlessPart && lineWrong) {
        await run(ffmpeg, [
          '-y',
          '-v',
          'error',
          '-i',
          at(`seg${k}.bin`),
          '-map',
          '0',
          '-c:v',
          'copy',
          '-af',
          `volume=${WORDLESS_DUCK_DB}dB`,
          '-c:a',
          'aac',
          '-b:a',
          PIECE_AUDIO_BITRATE,
          '-f',
          'mp4',
          at(`seg${k}-quiet.bin`),
        ])
          .then(() => fs.rename(at(`seg${k}-quiet.bin`), at(`seg${k}.bin`)))
          .catch(() => undefined);
      }
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
      const asked = group ? group.seconds : input.partSeconds?.[k];
      const piece = await normalizePiece(
        ffmpeg,
        at(`seg${k}.bin`),
        at(`piece${k + 1}.mp4`),
        size,
        fromLastFrame ? 1 : 0,
        segMatch,
        asked && asked > 0 ? Math.round(asked * 24) + overlap : undefined
      );
      // Its sound at the first clip's level: H3 writes each part's sound on its own, and a part
      // came out 25 dB quieter than the one before (live, keyframed parts).
      // A wordless part turned down for its garble stays down.
      if (h3 && !group && first.audio && !(wordlessPart && lineWrong)) {
        firstLoudness ??= await meanVolume(ffmpeg, at('piece0.mp4'));
        await levelPieceAudio(
          ffmpeg,
          at(`piece${k + 1}.mp4`),
          firstLoudness,
          at(`piece${k + 1}-l.mp4`)
        );
      }
      // No voice to keep yet (a wordless first clip, no kept Cast voice): the first part that
      // speaks sets it for the parts after it.
      if (
        h3 &&
        !voiceAnchor &&
        !lineWrong &&
        !input.voiceSample?.trim() &&
        !group &&
        input.lines?.[k]?.trim()
      ) {
        voiceAnchor = await voiceAnchorClip({
          ffmpeg,
          baseUrl,
          clip: at(`piece${k + 1}.mp4`),
          out: at(`voice${k + 1}.mp4`),
        }).catch(() => null);
      }
      pieces.push(at(`piece${k + 1}.mp4`));
      // Piece frame i is the segment's frame i + 1 (its first is dropped).
      tails[k + 1] =
        h3 && fromLastFrame && tailFiles?.length === TAIL_FRAMES
          ? { files: tailFiles, from: partFrames - TAIL_FRAMES, match: segMatch }
          : undefined;
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
      PIECE_AUDIO_BITRATE,
      '-movflags',
      '+faststart',
      at('extended.mp4'),
    ]);
    // Long parts render silent: the place's sound written for the whole clip (LTX-2.5, as Add
    // sound does), crossfaded in from the first clip's own sound where the parts begin.
    const final = groups
      ? await soundLongParts(ffmpeg, {
          clip: at('extended.mp4'),
          firstSec: lengths[0]! / 24,
          hadSound: first.audio,
          out: at('sounded.mp4'),
          scene: input.scene,
          place: input.setting,
          heat: input.heat,
          lead: input.lead,
          comfyUrl: input.comfyUrl,
        })
      : at('extended.mp4');
    const done = await probe(ffmpeg, final);
    const kept = await uploadComfyInputContent({
      baseUrl,
      bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ final)),
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
