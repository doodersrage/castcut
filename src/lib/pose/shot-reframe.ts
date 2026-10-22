/**
 * A picked waist-up or head-and-shoulders shot, made by cropping the finished still around her
 * face (the pure parts; shot-reframe-server.ts runs it in ComfyUI).
 *
 * Qwen-Image 2.1 does not move in for a close shot, whatever the prompt says. Camera bench,
 * 2026-10-22 (Turbo-8 and Noct-Q, six Day poses): as shipped a waist-up or close-up pick came out
 * full body; with CAMERA FIRST (withCameraFirst) thigh-up. Neither a square canvas (further out),
 * the plate reference cut to her upper body, nor a portrait lead line ("A head-and-shoulders
 * close-up portrait photograph…", leg words out, the place "softly out of focus") got closer than
 * waist-up on a close-up pick. So the still is rendered as now and cut to the shot afterwards,
 * around the face InsightFace finds: on the bench every crop landed (24/24 with a face), at
 * 1.2–2.1× for most stills, 3.4× at the furthest. The cut is enlarged back to the still's size
 * with lanczos only. Tried and dropped: 4x-UltraSharp (plastic skin, hard edges) and running the
 * still's own Turbo pass again on the enlarged cut (from the last one or two sigmas): sharper,
 * but it airbrushed her — freckles gone, made-up eyes, the face a little someone else's, on every
 * close-up. Lanczos keeps her skin as rendered; at 3.4× it is soft, not broken.
 */

import { pickedCameraLineIn } from './camera-shot';

export type ReframeShot = 'waist' | 'head';
export type ReframeFace = { x: number; y: number; width: number; height: number };
export type ReframeRect = { x: number; y: number; width: number; height: number };

/**
 * Crop geometry in face heights (InsightFace's box runs from the brow to the chin): how far above
 * the box the frame starts (hair and a little headroom) and how tall the frame is. On the bench's
 * stills the neck sat 1.3–1.7 face heights under the box's top and the hips 3.0–4.0.
 */
export const SHOT_REFRAME_GEOMETRY: Record<ReframeShot, { above: number; tall: number }> = {
  // Down to her waist.
  waist: { above: 0.7, tall: 4.4 },
  // Head, shoulders and the top of the chest.
  head: { above: 0.6, tall: 2.9 },
};

/** A crop at least this share of the still's height is close enough already: left alone. */
export const SHOT_REFRAME_MIN_CHANGE = 0.9;
/** Never enlarge more than this: a tiny face in a wide still gets a looser frame instead. */
export const SHOT_REFRAME_MAX_ZOOM = 4;

/** The shot a prompt's picked camera line asks for, when it is one a crop makes. */
export function pickedReframeShot(prompt: string | null | undefined): ReframeShot | null {
  const line = pickedCameraLineIn(prompt) ?? '';
  if (/\bwaist-up shot\b/i.test(line)) return 'waist';
  if (/\bhead-and-shoulders close-up\b/i.test(line)) return 'head';
  return null;
}

/**
 * The crop for a shot (the still's own aspect, her face centred across, the frame's top just above
 * her hair), or null when the still is already that close or the face box is unusable.
 */
export function shotReframeRect(
  size: { width: number; height: number },
  face: ReframeFace,
  shot: ReframeShot
): ReframeRect | null {
  const width = Math.floor(size.width);
  const height = Math.floor(size.height);
  if (!(width > 0 && height > 0 && face.width > 0 && face.height > 0)) return null;
  const geometry = SHOT_REFRAME_GEOMETRY[shot];
  let cropH = Math.min(height, geometry.tall * face.height);
  cropH = Math.max(cropH, height / SHOT_REFRAME_MAX_ZOOM);
  if (cropH >= height * SHOT_REFRAME_MIN_CHANGE) return null;
  let cropW = (cropH * width) / height;
  if (cropW > width) {
    cropW = width;
    cropH = (cropW * height) / width;
  }
  const centerX = face.x + face.width / 2;
  const x = Math.min(Math.max(0, centerX - cropW / 2), width - cropW);
  const y = Math.min(Math.max(0, face.y - geometry.above * face.height), height - cropH);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(cropW),
    height: Math.round(cropH),
  };
}

// ── The ComfyUI graph ─────────────────────────────────────────────────────────────────────

type Node = { class_type: string; inputs: Record<string, unknown> };
type Graph = Record<string, Node>;

export const SHOT_REFRAME_SAVE_NODE = 'rf_save';
export const SHOT_REFRAME_PREFIX = 'Castcut-reframe';

const LATENT_CLASS = /^Empty(?:SD3|Qwen\w*)?LatentImage$/;

/** A Qwen-Image 2.1 still's graph: the prompt it rendered and its canvas. */
export function reframeSourceOf(graph: Record<string, unknown> | null | undefined): {
  prompt: string;
  size: { width: number; height: number } | null;
} | null {
  if (!graph || typeof graph !== 'object') return null;
  const nodes = Object.values(graph as Graph).filter(
    node => node && typeof node === 'object' && typeof node.class_type === 'string'
  );
  const encoder = nodes.find(node => node.class_type === 'TextEncodeQwenImage21');
  if (!encoder) return null;
  const latent = nodes.find(node => LATENT_CLASS.test(node.class_type));
  const width = Number(latent?.inputs?.width);
  const height = Number(latent?.inputs?.height);
  return {
    prompt: String(encoder.inputs?.prompt ?? ''),
    size: width > 0 && height > 0 ? { width, height } : null,
  };
}

/** The still is of one person (the crop centres on the largest face; a duo would lose one). */
export function reframeIsSolo(prompt: string): boolean {
  return !/\btwo people\b|\bpartner\b|\bthree people\b|\bgroup\b/i.test(prompt);
}

/** Crop the finished still to the shot and enlarge it back to the still's size (lanczos). */
export function buildShotReframeGraph(input: {
  stillName: string;
  rect: ReframeRect;
  size: { width: number; height: number };
}): Graph {
  return {
    rf_load: { class_type: 'LoadImage', inputs: { image: input.stillName } },
    rf_crop: { class_type: 'ImageCrop', inputs: { image: ['rf_load', 0], ...input.rect } },
    rf_scale: {
      class_type: 'ImageScale',
      inputs: {
        image: ['rf_crop', 0],
        upscale_method: 'lanczos',
        width: input.size.width,
        height: input.size.height,
        crop: 'disabled',
      },
    },
    [SHOT_REFRAME_SAVE_NODE]: {
      class_type: 'SaveImage',
      inputs: { images: ['rf_scale', 0], filename_prefix: SHOT_REFRAME_PREFIX },
    },
  };
}
