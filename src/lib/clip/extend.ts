/**
 * "Make it 30 s": a finished Day / Story clip grows to about 30 seconds in chained segments
 * (clip-extend-server.ts). LTX-2.5 clips continue from their last 17 frames
 * (ltx25-renderer buildLtx25ExtendGraph); WAN clips replay their own graph from the last frame,
 * so the engine, LoRAs and settings stay those of the clip. Pure helpers, shared with the client.
 */

import type { SpokenLineHeat } from '../audio/spoken-line';

/** Where "Make it 30 s" stops. */
export const CLIP_EXTEND_TARGET_SECONDS = 30;
/** At most this many new segments in one job. */
export const CLIP_EXTEND_MAX_SEGMENTS = 8;
/** Frames the stitch blends at a WAN seam (its new segment starts on the previous last frame). */
export const WAN_EXTEND_BLEND_FRAMES = 2;

/** New segments to reach `targetSec` from a clip of `currentSec`, each adding `segmentSec - overlapSec`. */
export function extendSegmentCount(input: {
  currentSec: number;
  targetSec?: number;
  segmentSec: number;
  overlapSec: number;
}): number {
  const gain = Math.max(0.5, input.segmentSec - input.overlapSec);
  const missing = (input.targetSec ?? CLIP_EXTEND_TARGET_SECONDS) - Math.max(0, input.currentSec);
  if (missing <= 1) return 0;
  return Math.min(CLIP_EXTEND_MAX_SEGMENTS, Math.ceil(missing / gain));
}

const BEAT_HEAT: Record<SpokenLineHeat, string> = {
  clean: 'Everyday, natural actions.',
  flirty: 'Playful and flirty is fine; nothing explicit.',
  sensual:
    'An intimate moment between consenting adults: the closeness continues — kisses, touches, slow movement. No position changes that need a new camera angle.',
  explicit:
    'An explicit scene between consenting adults: the same act continues — rhythm, touches, kisses, expressions change; no new position, no new people.',
};

/**
 * A talking clip's parts: one person speaking to the camera the whole time. Live (2026-10-24, a
 * 30 s dialogue): beats like "moving a little" / "looks toward the camera" each nudged her
 * forward, and since every part starts from the last one's frames, by the end she was talking
 * into the lens — so she stays put, and only her hands, head and face move.
 */
const TALK_BEATS =
  'One person is talking to the camera the whole time. Each beat is a small gesture made where they are — a nod, a hand gesture, a smile, a tilt of the head, a glance aside and back. They stay exactly where they are, at the same distance from the camera: never stepping, leaning or moving toward it, never sitting down or standing up.';

const TALK_HEAT: Record<SpokenLineHeat, string> = {
  clean: 'Everyday, natural gestures.',
  flirty: 'Playful and flirty is fine in the looks and smiles; nothing explicit.',
  sensual:
    'Warm and teasing in the looks, smiles and small touches (hair, collar); one person only.',
  explicit: 'Bold and teasing in the looks, smiles and small touches; one person only.',
};

/** Ask the LLM for `count` beats that carry the clip on from `scene`. */
export function buildExtendBeatsMessages(input: {
  scene: string;
  setting?: string;
  count: number;
  heat?: SpokenLineHeat;
  /** Where the player wants it to go ("she finishes her coffee and heads out"). */
  direction?: string;
  /** Every part says a line: a talking clip, so the speaker stays put. */
  talking?: boolean;
}) {
  const direction = input.direction?.trim();
  const heat = input.heat ?? 'clean';
  const system = [
    `Continue a short video shot. Write ${input.count} beats, numbered 1-${input.count}, one per line.`,
    'Each beat is what happens in the next 4 seconds, carrying on from the one before it: one simple, physical action in present tense, 8 to 20 words.',
    'Same people, same clothes, same place; the camera does not move or cut. No new people, no dialogue, no time skips, nobody leaves the frame or the room.',
    input.talking
      ? TALK_BEATS
      : 'Small, believable steps — a gesture, a look, picking something up, moving a little — that add up to a tiny story.',
    input.talking ? TALK_HEAT[heat] : BEAT_HEAT[heat],
    direction
      ? 'The player said where it should go: follow that, spread over the beats in small steps so the last beat gets there.'
      : '',
    'Reply with the numbered beats only.',
  ]
    .filter(Boolean)
    .join('\n');
  const user = [
    `The shot so far: ${input.scene.trim().slice(0, 500)}`,
    input.setting?.trim() ? `Where: ${input.setting.trim().slice(0, 200)}` : '',
    direction ? `Where it should go: ${direction.slice(0, 300)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

/** The numbered beats from the LLM's reply (stage directions and quotes dropped). */
export function parseExtendBeats(reply: string | null | undefined): string[] {
  return (reply ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .split('\n')
    .map(line => line.match(/^\s*\d+\s*[.):-]\s*(.+)$/)?.[1] ?? '')
    .map(line =>
      line
        .replace(/["“”]/g, '')
        .replace(/\*[^*]+\*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(line => line.split(' ').length >= 3)
    .map(line => line.slice(0, 240));
}

/** Beats when the LLM is off or says nothing usable: the shot carries on, gently. */
export function fallbackExtendBeats(
  count: number,
  heat: SpokenLineHeat = 'clean',
  /** A talking clip's parts: gestures in place (see TALK_BEATS). */
  talking?: { speaker?: 'She' | 'He' }
): string[] {
  if (talking) {
    const who = talking.speaker ?? 'She';
    const her = who === 'He' ? 'his' : 'her';
    const steps = [
      `${who} keeps talking where ${who === 'He' ? 'he' : 'she'} is, with a small nod and a hand gesture.`,
      `${who} smiles and tilts ${her} head a little, staying exactly where ${who === 'He' ? 'he' : 'she'} is.`,
      `${who} glances aside for a moment, then back at the camera.`,
      `${who} gestures with one hand as ${who === 'He' ? 'he' : 'she'} talks, the same distance from the camera.`,
    ];
    return Array.from({ length: count }, (_, index) => steps[index % steps.length]!);
  }
  const steps =
    heat === 'sensual' || heat === 'explicit'
      ? [
          'They keep going, the same moment continuing, slow and close.',
          'A slow kiss, hands moving over each other, breathing deeper.',
          'They hold each other closer, the rhythm steady, eyes half closed.',
          'A small smile between them as the moment goes on.',
        ]
      : [
          'She carries on with what she is doing, relaxed and natural.',
          'She pauses, glances around the room, and smiles to herself.',
          'She shifts her weight and picks up where she left off.',
          'She looks toward the camera for a moment, then back to what she is doing.',
        ];
  return Array.from({ length: count }, (_, index) => steps[index % steps.length]!);
}

type GraphNode = { class_type?: string; inputs?: Record<string, unknown> };
type Graph = Record<string, GraphNode>;

const WAN_I2V = /^Wan.*(ImageToVideo|FirstLastFrame)/;
const SAVE_NODES = /^(SaveAnimatedWEBP|SaveAnimatedPNG|SaveVideo|SaveWEBM|VHS_VideoCombine)$/;

/** The graph is a WAN image-to-video clip this module can replay. */
export function isWanClipGraph(graph: Graph): boolean {
  return Object.values(graph).some(node => WAN_I2V.test(node?.class_type ?? ''));
}

function linkId(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null;
}

/** The text-encode node feeding `ref` (through conditioning / LoRA nodes, a few hops). */
function findTextNode(graph: Graph, ref: unknown, depth = 0): GraphNode | null {
  const id = linkId(ref);
  const node = id ? graph[id] : undefined;
  if (!node || depth > 6) return null;
  if (typeof node.inputs?.text === 'string') return node;
  for (const key of ['conditioning', 'positive', 'conditioning_to', 'conditioning_1']) {
    const found = findTextNode(graph, node.inputs?.[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * The clip's own WAN graph (from ComfyUI history) as the next segment: starts on `lastFrame`,
 * says `beat` before its own prompt, a new seed, no end pose, saved under `prefix`. Returns the
 * patched copy and its save node, or null when it is not a graph this can replay.
 */
export function patchWanReplayGraph(
  source: Graph,
  input: {
    lastFrame: string;
    beat: string;
    seed: number;
    prefix: string;
    /** The part's own prompt in place of the clip's (M11 T1). */
    ownText?: string;
  }
): { graph: Graph; saveNode: string } | null {
  const graph = JSON.parse(JSON.stringify(source)) as Graph;
  const i2v = Object.values(graph).find(node => WAN_I2V.test(node?.class_type ?? ''));
  const startId = linkId(i2v?.inputs?.start_image);
  const loader = startId ? graph[startId] : undefined;
  if (!i2v?.inputs || !loader?.inputs || !/LoadImage/.test(loader.class_type ?? '')) return null;
  loader.inputs.image = input.lastFrame;
  delete i2v.inputs.end_image;
  const text = findTextNode(graph, i2v.inputs.positive);
  if (text?.inputs) {
    const own = input.ownText?.trim() || String(text.inputs.text ?? '');
    text.inputs.text = `${input.beat.trim()} ${own}`.trim();
  }
  let seeded = 0;
  for (const node of Object.values(graph)) {
    for (const key of ['seed', 'noise_seed']) {
      if (typeof node?.inputs?.[key] === 'number') {
        node.inputs[key] = (input.seed + seeded) % 2 ** 32;
        seeded += 1;
      }
    }
  }
  const save = Object.entries(graph).find(([, node]) => SAVE_NODES.test(node?.class_type ?? ''));
  if (!save) return null;
  if (save[1].inputs) save[1].inputs.filename_prefix = input.prefix;
  return { graph, saveNode: save[0] };
}

/**
 * ffmpeg filter for the stitch: each piece's video crossfades into the next over `overlap[k]`
 * frames at 24 fps, the sound likewise. `frames[k]` is piece k's length.
 */
export function extendStitchFilter(frames: number[], overlap: number[]): string {
  const parts: string[] = [];
  let video = '[0:v]';
  let audio = '[0:a]';
  let length = frames[0]! / 24;
  for (let k = 1; k < frames.length; k += 1) {
    const fade = Math.max(1, overlap[k - 1] ?? 1) / 24;
    const offset = Math.max(0, length - fade);
    const v = `[v${k}]`;
    const a = `[a${k}]`;
    parts.push(
      `${video}[${k}:v]xfade=transition=fade:duration=${fade.toFixed(4)}:offset=${offset.toFixed(4)}${v}`
    );
    parts.push(`${audio}[${k}:a]acrossfade=d=${fade.toFixed(4)}${a}`);
    video = v;
    audio = a;
    length = offset + frames[k]! / 24;
  }
  return frames.length > 1 ? parts.join(';') : '[0:v]null[v0];[0:a]anull[a0]';
}

export type ClipExtendJob = {
  id: string;
  status: 'running' | 'completed' | 'error';
  /** Segments rendered so far, of `total`. */
  done: number;
  total: number;
  url?: string;
  seconds?: number;
  error?: string;
};

export type ClipExtendRequest = {
  clipUrl: string;
  clipPromptId?: string;
  scene: string;
  setting?: string;
  heat?: SpokenLineHeat;
  targetSec?: number;
  /** This many seconds longer instead of up to `targetSec`. */
  extendBySec?: number;
  /** Where the player wants it to go; steers the written beats. */
  direction?: string;
  /** The player's own beats, one per part, used as written. */
  beats?: string[];
  /**
   * Each part's own prompt (same order as the beats), built the way the first clip's was from the
   * part's beat (M11 T1): an H3 or WAN part says it instead of the first clip's prompt again.
   */
  partPrompts?: string[];
  /** A spoken line per beat (same order, '' = none) — LTX clips only. */
  lines?: string[];
  /** How each line is said (same order; '' / 'natural' = plainly). */
  tones?: string[];
  /** Who says the lines. */
  lead?: 'woman' | 'man';
};

/** The parts this clip needs and the beats written for them, nothing rendered (client). */
export async function requestClipExtendPlan(
  input: ClipExtendRequest,
  llmBody?: Record<string, unknown>
): Promise<{ total: number; beats: string[]; partSec: number; engine: 'ltx' | 'wan' | 'h3' }> {
  const response = await fetch('/api/clip/extend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...llmBody, plan: true }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    plan?: { total: number; beats: string[]; partSec: number; engine: 'ltx' | 'wan' | 'h3' };
    error?: string;
  };
  if (!response.ok || !body.plan) throw new Error(body.error ?? 'Could not plan the extension.');
  return body.plan;
}

/** Start "Make it 30 s" (client): the job, at once. */
export async function startClipExtend(
  input: ClipExtendRequest,
  llmBody?: Record<string, unknown>
): Promise<ClipExtendJob> {
  const start = await fetch('/api/clip/extend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...llmBody }),
  });
  const started = (await start.json().catch(() => ({}))) as { job?: ClipExtendJob; error?: string };
  if (!start.ok || !started.job) throw new Error(started.error ?? 'Could not extend the clip.');
  return started.job;
}

/** The server no longer knows the job (it restarted): the slot should stop waiting for it. */
export class ClipExtendJobLost extends Error {}

/** Wait for a job (client) — also one started before a reload. Resolves with the finished job. */
export async function waitForClipExtend(
  jobId: string,
  options?: { onProgress?: (job: ClipExtendJob) => void; pollMs?: number }
): Promise<ClipExtendJob> {
  for (;;) {
    const poll = await fetch(`/api/clip/extend?jobId=${encodeURIComponent(jobId)}`, {
      credentials: 'same-origin',
    });
    if (poll.status === 404) {
      throw new ClipExtendJobLost(
        'The server restarted while this clip was being made longer — try again.'
      );
    }
    const body = (await poll.json().catch(() => ({}))) as { job?: ClipExtendJob; error?: string };
    if (!poll.ok || !body.job) throw new Error(body.error ?? 'Lost track of the extension.');
    options?.onProgress?.(body.job);
    if (body.job.status === 'completed' && body.job.url) return body.job;
    if (body.job.status === 'error') throw new Error(body.job.error ?? 'The extension failed.');
    await new Promise(resolve => setTimeout(resolve, options?.pollMs ?? 4000));
  }
}

/** Progress text for a running job. */
export function clipExtendProgressNote(job: Pick<ClipExtendJob, 'done' | 'total'>): string {
  return job.total
    ? `Rendering part ${Math.min(job.done + 1, job.total)} of ${job.total}…`
    : 'Writing what happens next…';
}

export type ChannelStats = { mean: number[]; std: number[] };
export type ColorMatch = { gain: number[]; offset: number[] };

/**
 * Per-channel gain / offset that bring `current`'s RGB mean and spread back to `reference`'s.
 * Live (2026-10-10, a 7-hop WAN chain): each segment starts from the last one's final frame, so a
 * slight warm cast compounded until the room was pink by 21 s; matching every start frame and
 * segment to the clip's first frame stops it adding up. Gains are clamped so a real change in the
 * shot (a lamp turned on) is only softened, never inverted.
 */
export function colorMatchGains(reference: ChannelStats, current: ChannelStats): ColorMatch {
  const gain: number[] = [];
  const offset: number[] = [];
  for (let c = 0; c < 3; c += 1) {
    const g = Math.min(
      1.25,
      Math.max(0.8, (reference.std[c] ?? 1) / Math.max(1, current.std[c] ?? 1))
    );
    gain.push(Number(g.toFixed(4)));
    offset.push(Number(((reference.mean[c] ?? 0) - g * (current.mean[c] ?? 0)).toFixed(2)));
  }
  return { gain, offset };
}

/** The match as an ffmpeg lutrgb filter (8-bit). */
export function colorMatchFilter(match: ColorMatch): string {
  const channel = (name: string, c: number) =>
    `${name}='clip(val*${match.gain[c]}+${match.offset[c]},0,255)'`;
  return `lutrgb=${channel('r', 0)}:${channel('g', 1)}:${channel('b', 2)}`;
}

/**
 * Detail in a greyscale frame: the variance of its Laplacian (edges and texture; a softer frame
 * scores lower).
 */
export function laplacianVariance(grey: ArrayLike<number>, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const v = grey[i - width]! + grey[i + width]! + grey[i - 1]! + grey[i + 1]! - 4 * grey[i]!;
      sum += v;
      sumSq += v * v;
      n += 1;
    }
  }
  return n ? sumSq / n - (sum / n) ** 2 : 0;
}

/**
 * Unsharp-mask strengths tried on a WAN hop's start frame, gentlest first. Live (2026-10-13, a
 * 3-part WAN chain at dusk): WAN renders each part softer than the frame it starts from, and the
 * softening compounded — detail 172 → 30 by 14 s. Sharpening each start frame back toward the
 * clip's first frame (never past it) held 84 at 14 s with no halos at 1:1; an UltraSharp 4×
 * round trip held less (60) and waxed the skin.
 */
export const WAN_START_SHARPEN_STEPS = [0.5, 1, 1.5, 2, 3] as const;

/** Index of the strongest step whose result stays at or under the clip's own detail; -1 = none. */
export function pickStartSharpenIndex(target: number, detailAfter: ReadonlyArray<number>): number {
  let chosen = -1;
  for (let i = 0; i < detailAfter.length && i < WAN_START_SHARPEN_STEPS.length; i += 1) {
    if (detailAfter[i]! > target) break;
    chosen = i;
  }
  return chosen;
}
