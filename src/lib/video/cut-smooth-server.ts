import 'server-only';
/**
 * Smooth motion for a cut: a clip made at 16 / 24 fps gets the frames in between drawn by RIFE
 * (ComfyUI core FrameInterpolate, rife_v4.26) — twice the frames, the same length — so the 30 fps
 * film moves smoothly instead of repeating frames. Clips at 25 fps or more are left as they are.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { uploadComfyInputContent } from '../comfyui/comfy-input-upload-server';
import {
  comfyBaseUrl,
  resolveComfyNode,
  runComfyUtilityGraph,
  type ComfyHistoryEntry,
  type ComfyImageRef,
} from '../comfyui/comfy-utility-graph-server';

export const RIFE_MODEL = 'rife_v4.26.safetensors';
const SAVE_NODE = '6';
/** At or above this frame rate a clip already moves smoothly enough. */
const SMOOTH_ENOUGH_FPS = 25;

const stderrOf = (bin: string, args: string[]) =>
  new Promise<string>(resolve => {
    execFile(bin, args, { maxBuffer: 16 * 1024 * 1024 }, (_error, _out, stderr) =>
      resolve(String(stderr))
    );
  });

/** A clip's frame rate (ffmpeg's stream header), or null. */
export async function clipFps(ffmpeg: string, file: string): Promise<number | null> {
  const log = await stderrOf(ffmpeg, ['-hide_banner', '-i', file]);
  const match = log.match(/Video:.*?(\d+(?:\.\d+)?) fps/);
  return match ? Number(match[1]) : null;
}

/** The RIFE graph: the clip's frames ×2 at twice the rate, its sound kept. */
export function buildSmoothGraph(input: { file: string; fps: number }): Record<string, unknown> {
  return {
    '1': { class_type: 'LoadVideo', inputs: { file: input.file } },
    '2': { class_type: 'GetVideoComponents', inputs: { video: ['1', 0] } },
    '3': { class_type: 'FrameInterpolationModelLoader', inputs: { model_name: RIFE_MODEL } },
    '4': {
      class_type: 'FrameInterpolate',
      inputs: { interp_model: ['3', 0], images: ['2', 0], multiplier: 2 },
    },
    '5': {
      class_type: 'CreateVideo',
      inputs: { images: ['4', 0], audio: ['2', 1], fps: Math.round(input.fps * 2 * 1000) / 1000 },
    },
    [SAVE_NODE]: {
      class_type: 'SaveVideo',
      inputs: { video: ['5', 0], filename_prefix: 'castcut-smooth', format: 'mp4', codec: 'h264' },
    },
  };
}

/** True when this ComfyUI can interpolate frames (the core nodes and the RIFE model). */
export async function canSmoothMotion(comfyUrl?: string): Promise<boolean> {
  const loader = await resolveComfyNode(comfyBaseUrl(comfyUrl), ['FrameInterpolationModelLoader']);
  const options = (
    loader?.info as { input?: { required?: { model_name?: unknown[] } } } | undefined
  )?.input?.required?.model_name;
  const names = JSON.stringify(options ?? []);
  return Boolean(loader) && names.includes(RIFE_MODEL);
}

/** The saved clip (SaveVideo, node 6) — LoadVideo also lists the input it read. */
function savedVideo(entry: ComfyHistoryEntry): ComfyImageRef | undefined {
  const outputs = (entry.outputs ?? {}) as Record<string, Record<string, ComfyImageRef[]>>;
  const out = outputs[SAVE_NODE];
  return [...(out?.images ?? []), ...(out?.videos ?? []), ...(out?.gifs ?? [])].find(
    file => file?.filename && file.type !== 'input'
  );
}

/**
 * The clip at `file` (an MP4) smoothed to twice its frames, written to `out`; false when it
 * already runs at 25 fps or more (nothing written).
 */
export async function smoothClipFile(input: {
  ffmpeg: string;
  file: string;
  out: string;
  comfyUrl?: string;
}): Promise<boolean> {
  const fps = await clipFps(input.ffmpeg, input.file);
  if (!fps || fps >= SMOOTH_ENOUGH_FPS) return false;
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const staged = await uploadComfyInputContent({
    baseUrl,
    bytes: new Uint8Array(await fs.readFile(/* turbopackIgnore: true */ input.file)),
    filename: 'castcut-smooth-in.mp4',
    mimeType: 'video/mp4',
  });
  const rendered = await runComfyUtilityGraph<ComfyImageRef>({
    baseUrl,
    label: 'cut-smooth',
    priority: 'queue',
    timeoutMs: 20 * 60_000,
    prompt: buildSmoothGraph({
      file: staged.subfolder ? `${staged.subfolder}/${staged.name}` : staged.name,
      fps,
    }),
    read: savedVideo,
  });
  if (!rendered.result) throw new Error('Smoothing a clip finished without a video.');
  const view = new URLSearchParams({
    filename: rendered.result.filename,
    subfolder: rendered.result.subfolder ?? '',
    type: rendered.result.type || 'output',
  });
  const response = await fetch(`${baseUrl}/view?${view.toString()}`);
  if (!response.ok) throw new Error(`Could not fetch the smoothed clip (HTTP ${response.status}).`);
  await fs.writeFile(
    /* turbopackIgnore: true */ input.out,
    Buffer.from(await response.arrayBuffer())
  );
  return true;
}
