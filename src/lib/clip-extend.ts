/**
 * "Make it 30 s": a finished Day / Story clip grows to about 30 seconds in chained segments
 * (clip-extend-server.ts). LTX-2.5 clips continue from their last 17 frames
 * (ltx25-renderer buildLtx25ExtendGraph); WAN clips replay their own graph from the last frame,
 * so the engine, LoRAs and settings stay those of the clip. Pure helpers, shared with the client.
 */

import type { SpokenLineHeat } from './spoken-line';

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

/** Ask the LLM for `count` beats that carry the clip on from `scene`. */
export function buildExtendBeatsMessages(input: {
  scene: string;
  setting?: string;
  count: number;
  heat?: SpokenLineHeat;
}) {
  const system = [
    `Continue a short video shot. Write ${input.count} beats, numbered 1-${input.count}, one per line.`,
    'Each beat is what happens in the next 4 seconds, carrying on from the one before it: one simple, physical action in present tense, 8 to 20 words.',
    'Same people, same clothes, same place; the camera does not move or cut. No new people, no dialogue, no time skips.',
    'Small, believable steps — a gesture, a look, picking something up, moving a little — that add up to a tiny story.',
    BEAT_HEAT[input.heat ?? 'clean'],
    'Reply with the numbered beats only.',
  ].join('\n');
  const user = [
    `The shot so far: ${input.scene.trim().slice(0, 500)}`,
    input.setting?.trim() ? `Where: ${input.setting.trim().slice(0, 200)}` : '',
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
export function fallbackExtendBeats(count: number, heat: SpokenLineHeat = 'clean'): string[] {
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
  input: { lastFrame: string; beat: string; seed: number; prefix: string }
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
    text.inputs.text = `${input.beat.trim()} ${String(text.inputs.text ?? '')}`.trim();
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

/** Start "Make it 30 s" and wait for it (client). Calls `onProgress` as segments land. */
export async function requestClipExtend(
  input: {
    clipUrl: string;
    clipPromptId?: string;
    scene: string;
    setting?: string;
    heat?: SpokenLineHeat;
    targetSec?: number;
  },
  options?: {
    llmBody?: Record<string, unknown>;
    onProgress?: (job: ClipExtendJob) => void;
    pollMs?: number;
  }
): Promise<ClipExtendJob> {
  const start = await fetch('/api/clip/extend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ ...input, ...options?.llmBody }),
  });
  const started = (await start.json().catch(() => ({}))) as { job?: ClipExtendJob; error?: string };
  if (!start.ok || !started.job) throw new Error(started.error ?? 'Could not extend the clip.');
  let job = started.job;
  options?.onProgress?.(job);
  while (job.status === 'running') {
    await new Promise(resolve => setTimeout(resolve, options?.pollMs ?? 4000));
    const poll = await fetch(`/api/clip/extend?jobId=${encodeURIComponent(job.id)}`, {
      credentials: 'same-origin',
    });
    const body = (await poll.json().catch(() => ({}))) as { job?: ClipExtendJob; error?: string };
    if (!poll.ok || !body.job) throw new Error(body.error ?? 'Lost track of the extension.');
    job = body.job;
    options?.onProgress?.(job);
  }
  if (job.status === 'error' || !job.url) throw new Error(job.error ?? 'The extension failed.');
  return job;
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
