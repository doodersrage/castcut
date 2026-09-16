import {
  DEFAULT_FAL_EXTEND_MODEL,
  DEFAULT_FAL_I2V_MODEL,
  DEFAULT_FAL_T2V_MODEL,
  DEFAULT_REPLICATE_I2V_MODEL,
  DEFAULT_REPLICATE_T2V_MODEL,
  DEFAULT_LUMA_I2V_MODEL,
  DEFAULT_LUMA_T2V_MODEL,
  DEFAULT_RUNWAY_EXTEND_MODEL,
  DEFAULT_RUNWAY_I2V_MODEL,
  DEFAULT_RUNWAY_T2V_MODEL,
} from './engine/capabilities';
import { isAllowedFalMediaUrl } from './fal-protocol';

export const VIDEO_CLIP_MODES = ['t2v', 'i2v', 'extend'] as const;
export type VideoClipMode = (typeof VIDEO_CLIP_MODES)[number];

export const DEFAULT_VIDEO_CLIP_MODE: VideoClipMode = 't2v';

/** How cloud / local continue runs for a parent clip. */
export const VIDEO_CONTINUE_PATHS = ['extend', 'last-frame', 'stitch'] as const;
export type VideoContinuePath = (typeof VIDEO_CONTINUE_PATHS)[number];

export type ContinueClipActionLabel =
  'Extend clip' | 'Continue from last frame' | 'Stitch continue';

export function normalizeVideoClipMode(value: unknown): VideoClipMode {
  const id = String(value ?? '')
    .trim()
    .toLowerCase();
  if (id === 'extend' || id === 'v2v' || id === 'video-to-video') {
    return 'extend';
  }
  if (id === 'i2v' || id === 'image-to-video' || id === 'img2vid' || id === 'continue') {
    return 'i2v';
  }
  if (id === 't2v' || id === 'text-to-video' || id === 'txt2vid') {
    return 't2v';
  }
  return DEFAULT_VIDEO_CLIP_MODE;
}

export function inferVideoClipMode(input: {
  clipMode?: unknown;
  hasInitImage?: boolean;
}): VideoClipMode {
  if (input.clipMode != null && String(input.clipMode).trim()) {
    return normalizeVideoClipMode(input.clipMode);
  }
  return input.hasInitImage ? 'i2v' : 't2v';
}

export function resolveFalVideoModel(input: {
  clipMode: VideoClipMode;
  i2vModel?: string | null;
  t2vModel?: string | null;
  extendModel?: string | null;
}): string {
  if (input.clipMode === 'extend') {
    return input.extendModel?.trim() || DEFAULT_FAL_EXTEND_MODEL;
  }
  if (input.clipMode === 'i2v') {
    return input.i2vModel?.trim() || DEFAULT_FAL_I2V_MODEL;
  }
  return input.t2vModel?.trim() || DEFAULT_FAL_T2V_MODEL;
}

/**
 * Replicate has no documented extend/V2V for our Kling/WAN/LTX presets.
 * `clipMode: 'extend'` resolves to the I2V model for last-frame continue.
 */
export function resolveReplicateVideoModel(input: {
  clipMode: VideoClipMode;
  i2vModel?: string | null;
  t2vModel?: string | null;
}): string {
  if (input.clipMode === 'i2v' || input.clipMode === 'extend') {
    return input.i2vModel?.trim() || DEFAULT_REPLICATE_I2V_MODEL;
  }
  return input.t2vModel?.trim() || DEFAULT_REPLICATE_T2V_MODEL;
}

/** Luma Ray 2 T2V/I2V; extend falls back to last-frame I2V in the studio. */
export function resolveLumaVideoModel(input: {
  clipMode: VideoClipMode;
  i2vModel?: string | null;
  t2vModel?: string | null;
}): string {
  if (input.clipMode === 'i2v' || input.clipMode === 'extend') {
    return input.i2vModel?.trim() || DEFAULT_LUMA_I2V_MODEL;
  }
  return input.t2vModel?.trim() || DEFAULT_LUMA_T2V_MODEL;
}

/** Runway Gen-4.5 T2V/I2V; extend uses Aleph video-to-video. */
export function resolveRunwayVideoModel(input: {
  clipMode: VideoClipMode;
  i2vModel?: string | null;
  t2vModel?: string | null;
  extendModel?: string | null;
}): string {
  if (input.clipMode === 'extend') {
    return input.extendModel?.trim() || DEFAULT_RUNWAY_EXTEND_MODEL;
  }
  if (input.clipMode === 'i2v') {
    return input.i2vModel?.trim() || DEFAULT_RUNWAY_I2V_MODEL;
  }
  return input.t2vModel?.trim() || DEFAULT_RUNWAY_T2V_MODEL;
}

/** True when Replicate should treat this clip mode as last-frame I2V. */
export function replicateUsesLastFrameI2v(clipMode: VideoClipMode): boolean {
  return clipMode === 'i2v' || clipMode === 'extend';
}

export function falVideoRequiresFirstFrame(clipMode: VideoClipMode): boolean {
  return clipMode === 'i2v';
}

export function falVideoRequiresParentClip(clipMode: VideoClipMode): boolean {
  return clipMode === 'extend';
}

/** Fal / Grok / Runway native extend send a parent clip URL (no first-frame image). */
export function cloudNativeExtendEngines(engine: string | undefined | null): boolean {
  return engine === 'fal' || engine === 'grok' || engine === 'runway';
}

/** Engines that need a first-frame image when the UI asks for extend/continue. */
export function cloudContinueUsesLastFrameI2v(
  engine: string | undefined | null,
  clipMode: VideoClipMode
): boolean {
  if (clipMode !== 'extend' && clipMode !== 'i2v') {
    return false;
  }
  if (clipMode === 'i2v') {
    return true;
  }
  // extend on Fal/Grok/Runway uses video_url / extensions / video_to_video
  return !cloudNativeExtendEngines(engine);
}

/** Fal extend-video can fetch only public Fal-hosted https clips. */
export function canFalExtendFromParentUrl(url: string | undefined | null): boolean {
  const trimmed = String(url ?? '').trim();
  return Boolean(trimmed) && isAllowedFalMediaUrl(trimmed);
}

/**
 * Resolve which continue path will run for a parent clip + engine.
 * - Fal: LTX extend-video when the parent is already a public Fal URL
 * - Grok: native `/v1/videos/extensions` when a parent clip URL is present
 * - Runway: native `/v1/video_to_video` (Aleph) when a parent clip URL is present
 * - Gemini: Veo cannot extend arbitrary uploads → last-frame I2V + server stitch
 * - Replicate: last-frame I2V (no documented extend on our presets)
 */
export function resolveVideoContinuePath(input: {
  parentUrl?: string | null;
  engine?: string | null;
}): VideoContinuePath {
  const engine = String(input.engine ?? '')
    .trim()
    .toLowerCase();
  const parentUrl = String(input.parentUrl ?? '').trim();
  if (!parentUrl) {
    return 'last-frame';
  }
  if (engine === 'fal' && canFalExtendFromParentUrl(parentUrl)) {
    return 'extend';
  }
  if (engine === 'grok' || engine === 'runway') {
    return 'extend';
  }
  if (engine === 'gemini') {
    return 'stitch';
  }
  return 'last-frame';
}

export function continueClipActionLabel(input: {
  parentUrl?: string | null;
  engine?: string | null;
}): ContinueClipActionLabel {
  const path = resolveVideoContinuePath(input);
  if (path === 'extend') {
    return 'Extend clip';
  }
  if (path === 'stitch') {
    return 'Stitch continue';
  }
  return 'Continue from last frame';
}

export function continueClipPathRanMessage(path: VideoContinuePath): string {
  if (path === 'extend') {
    return 'Queued with native Extend.';
  }
  if (path === 'stitch') {
    return 'Queued as Continue from last frame — will Stitch continue when the take finishes.';
  }
  return 'Queued as Continue from last frame.';
}

export function engineCanQueueClips(engine: string | undefined | null): boolean {
  return (
    engine === 'fal' ||
    engine === 'replicate' ||
    engine === 'grok' ||
    engine === 'gemini' ||
    engine === 'runway' ||
    engine === 'luma'
  );
}

/** Fal Kling / WAN video endpoints only accept 5s or 10s. */
export const FAL_VIDEO_DURATION_SECONDS = [5, 10] as const;
export type FalVideoDurationSec = (typeof FAL_VIDEO_DURATION_SECONDS)[number];

export function snapFalVideoDurationSec(seconds?: number | null): FalVideoDurationSec {
  const value = Number(seconds);
  if (!Number.isFinite(value)) {
    return 5;
  }
  return value >= 8 ? 10 : 5;
}

/** Kling/WAN want '5'|'10'; LTX/Grok want a number; Veo wants '4s'|'6s'|'8s'. */
export function falVideoDurationPayload(
  modelId: string | undefined,
  seconds?: number | null
): string | number {
  const snapped = snapFalVideoDurationSec(seconds);
  const id = String(modelId ?? '');
  if (/veo3/i.test(id)) {
    return snapped >= 8 ? '8s' : '6s';
  }
  if (/extend-video/i.test(id)) {
    return snapped >= 8 ? 10 : 5;
  }
  if (/ltx/i.test(id) || /grok-imagine-video/i.test(id)) {
    return snapped >= 8 ? 10 : 6;
  }
  return String(snapped);
}

/** Documented Fal LTX extend-video fields. Parent must already be a Fal https clip. */
export function falExtendQueueFields(
  parentUrl: string,
  durationSec?: number | null
): { video_url: string; mode: 'end'; duration: number } {
  return {
    video_url: parentUrl.trim(),
    mode: 'end',
    duration: Number(falVideoDurationPayload(DEFAULT_FAL_EXTEND_MODEL, durationSec)),
  };
}

/** Replicate Kling wants 5|10; documented LTX 2.3 wants 6|10. */
export function replicateVideoDurationPayload(
  modelId: string | undefined,
  seconds?: number | null
): number {
  const snapped = snapFalVideoDurationSec(seconds);
  return /ltx/i.test(String(modelId ?? '')) ? (snapped >= 8 ? 10 : 6) : snapped;
}
