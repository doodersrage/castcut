/**
 * Director: a move from the player's own video ("From a video…"). The server reads the body in
 * every frame (DWPose on ComfyUI, video-pose-server.ts); here those flat poses become the 3D
 * body moving: the lead person followed frame to frame, each frame lifted through one camera
 * (read from the first), frames with no one in them filled between their neighbours, a limb
 * that flips for a frame or two put back (a flat picture reads a limb toward or away from the
 * camera either way), the motion smoothed, and set down at the origin facing +z on the floor —
 * as a ready-made move starts — so the timeline places it like one.
 *
 * Spike (2026-10-29, a 2.5 s wave read at 16 fps): 40 frames lifted in 1.3 s; 14 one-frame flips
 * over 30° before the clean-up, none after; the 3D body waved as the video did.
 */

import { Quaternion } from 'three';
import type { NormalizedBody } from '@/lib/pose/library';
import { parseOpenPoseJson } from '@/lib/pose/score';
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { liftBody, liftBodyWithCamera } from '@/lib/pose/rig3d-pose';
import { groundFigure, mixFigures, ORIGIN, placementOf, transformFigure } from './figure-ops';
import { VIDEO_MOTION_MAX_FRAMES } from './types';
/** Fewer frames than this with a person in them: not enough to move by. */
const MIN_READ_FRAMES = 8;

/** The server's read: every frame's people (flat, 0–1 of the frame), at DIRECTOR_FPS. */
export type VideoPoseRead = {
  canvas: { width: number; height: number };
  frames: Array<NormalizedBody[]>;
};

/**
 * DWPose's `openpose_json` for a video (a list of frames, each its people) as the read: null
 * when it is not one.
 */
export function parseVideoPoseFrames(raw: unknown): VideoPoseRead | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || !value.length) return null;
  let canvas: VideoPoseRead['canvas'] | null = null;
  const frames = value.map(frame => {
    const pose = parseOpenPoseJson(frame);
    if (pose && !canvas && pose.canvas.width > 0 && pose.canvas.height > 0) canvas = pose.canvas;
    return pose?.people ?? [];
  });
  return canvas ? { canvas, frames } : null;
}

function centre(body: NormalizedBody): { x: number; y: number } | null {
  const points = [body[1], body[8], body[11]].filter((p): p is { x: number; y: number } =>
    Boolean(p)
  );
  if (!points.length) return null;
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

function height(body: NormalizedBody): number {
  const ys = body.filter((p): p is { x: number; y: number } => Boolean(p)).map(p => p.y);
  return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
}

/**
 * The lead person in every frame: the tallest in the first frame with anyone, then whoever is
 * nearest where the lead was (someone walking past behind her is not taken for her). A frame
 * with no one near is a gap (null).
 */
export function followLead(frames: VideoPoseRead['frames']): Array<NormalizedBody | null> {
  let last: { x: number; y: number } | null = null;
  return frames.map(people => {
    const seen = people.filter(body => centre(body));
    if (!seen.length) return null;
    let lead: NormalizedBody;
    if (!last) lead = seen.reduce((a, b) => (height(b) > height(a) ? b : a));
    else {
      const from = last;
      lead = seen.reduce((a, b) => {
        const da = Math.hypot(centre(a)!.x - from.x, centre(a)!.y - from.y);
        const db = Math.hypot(centre(b)!.x - from.x, centre(b)!.y - from.y);
        return db < da ? b : a;
      });
      const c = centre(lead)!;
      if (Math.hypot(c.x - from.x, c.y - from.y) > 0.25) return null;
    }
    last = centre(lead);
    return lead;
  });
}

const angle = (a: readonly number[], b: readonly number[]) =>
  new Quaternion(...(a as [number, number, number, number])).angleTo(
    new Quaternion(...(b as [number, number, number, number]))
  );

/** A bone this far off both neighbours, which agree with each other, flipped for that frame. */
const SPIKE = (25 * Math.PI) / 180;
const AGREE = (20 * Math.PI) / 180;

/**
 * Frames where a bone jumps away and straight back (a one- or two-frame flip of the lift) get
 * that bone from between their neighbours.
 */
export function removeFlips(figures: PoseRig3dFigure[]): PoseRig3dFigure[] {
  const out = figures.map(figure => structuredClone(figure));
  for (const gap of [1, 2]) {
    for (let i = gap; i + 1 < out.length; i += 1) {
      const before = out[i - gap]!;
      const after = out[Math.min(out.length - 1, i + 1)]!;
      for (const bone of Object.keys(out[i]!.bones)) {
        const q = out[i]!.bones[bone]!;
        const a = before.bones[bone];
        const b = after.bones[bone];
        if (!a || !b) continue;
        if (angle(q, a) > SPIKE && angle(q, b) > SPIKE && angle(a, b) < AGREE) {
          const fixed = new Quaternion(...a).slerp(new Quaternion(...b), gap / (gap + 1));
          out[i]!.bones[bone] = [fixed.x, fixed.y, fixed.z, fixed.w];
        }
      }
    }
  }
  return out;
}

/** Gaussian smoothing of every bone's turn (hemisphere aligned) and the hips' place. */
export function smoothFigures(figures: PoseRig3dFigure[], sigma = 1.2): PoseRig3dFigure[] {
  if (sigma <= 0 || figures.length < 3) return figures;
  const reach = Math.ceil(sigma * 3);
  const at = (i: number) => figures[Math.min(figures.length - 1, Math.max(0, i))]!;
  return figures.map((figure, i) => {
    const out = structuredClone(figure);
    for (const [bone, ref] of Object.entries(figure.bones)) {
      const sum = [0, 0, 0, 0];
      let weights = 0;
      for (let k = -reach; k <= reach; k += 1) {
        const q = at(i + k).bones[bone] ?? ref;
        const sign = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1;
        const w = Math.exp(-(k * k) / (2 * sigma * sigma));
        for (let c = 0; c < 4; c += 1) sum[c]! += sign * q[c]! * w;
        weights += w;
      }
      const q = new Quaternion(
        ...(sum.map(v => v / weights) as [number, number, number, number])
      ).normalize();
      out.bones[bone] = [q.x, q.y, q.z, q.w];
    }
    const position = [0, 0, 0];
    let weights = 0;
    for (let k = -reach; k <= reach; k += 1) {
      const w = Math.exp(-(k * k) / (2 * sigma * sigma));
      at(i + k).position.forEach((v, c) => (position[c]! += v * w));
      weights += w;
    }
    out.position = position.map(v => v / weights) as [number, number, number];
    return out;
  });
}

const round = (value: number, places: number) => {
  const k = 10 ** places;
  return Math.round(value * k) / k;
};

/** A figure rounded for keeping (turns to 1e-3 — about a tenth of a degree — places to 1 mm). */
export function compactFigure(figure: PoseRig3dFigure): PoseRig3dFigure {
  const bones: PoseRig3dFigure['bones'] = {};
  for (const [bone, q] of Object.entries(figure.bones)) {
    bones[bone] = q.map(v => round(v, 3)) as [number, number, number, number];
  }
  return {
    body: figure.body,
    position: figure.position.map(v => round(v, 3)) as [number, number, number],
    bones,
    ...(figure.scale ? { scale: figure.scale } : {}),
  };
}

/**
 * The video's motion on the 3D body, one figure per frame at DIRECTOR_FPS. Throws when too few
 * frames show a person.
 */
export function liftVideoMotion(read: VideoPoseRead, kind: Rig3dBodyKind): PoseRig3dFigure[] {
  const leads = followLead(read.frames.slice(0, VIDEO_MOTION_MAX_FRAMES));
  const firstSeen = leads.findIndex(Boolean);
  const lastSeen = leads.length - 1 - [...leads].reverse().findIndex(Boolean);
  const seen = leads.filter(Boolean).length;
  if (firstSeen < 0 || seen < MIN_READ_FRAMES || seen < (lastSeen - firstSeen + 1) / 2) {
    throw new Error(
      'No one could be followed through most of that video — try one with a single person, whole in the frame.'
    );
  }
  const span = leads.slice(firstSeen, lastSeen + 1);
  const aspect = read.canvas.width / Math.max(1, read.canvas.height);
  // One camera for the whole video, read from the first frame (a fixed camera, as most are).
  const { camera } = liftBodyWithCamera(span[0]!, aspect, { body: kind, proportions: false });
  const lifted: Array<PoseRig3dFigure | null> = span.map(body =>
    body ? liftBody(body, aspect, { camera, body: kind, proportions: false }) : null
  );
  // Gaps: between the frames either side (or held at an end).
  const filled = lifted.map((figure, i) => {
    if (figure) return figure;
    let a = i - 1;
    while (a >= 0 && !lifted[a]) a -= 1;
    let b = i + 1;
    while (b < lifted.length && !lifted[b]) b += 1;
    if (a < 0) return lifted[b]!;
    if (b >= lifted.length) return lifted[a]!;
    return mixFigures(lifted[a]!, lifted[b]!, (i - a) / (b - a));
  });
  const smoothed = smoothFigures(removeFlips(filled));
  const start = placementOf(smoothed[0]!);
  // Rounded for keeping, then set on the floor (rounding the turns moves the feet a little).
  return smoothed.map(figure => {
    const kept = groundFigure(compactFigure(transformFigure(figure, start, ORIGIN)));
    kept.position = kept.position.map(v => round(v, 4)) as [number, number, number];
    return kept;
  });
}

/** A video beat's frames `seconds` long at `fps` (its timing stretched to fit). */
export function videoBeatFrames(
  frames: PoseRig3dFigure[],
  seconds: number,
  fps: number
): PoseRig3dFigure[] {
  const count = Math.max(2, Math.round(seconds * fps) + 1);
  const last = frames.length - 1;
  if (last < 1) return Array.from({ length: count }, () => frames[0]!);
  return Array.from({ length: count }, (_, i) => {
    const f = (i / (count - 1)) * last;
    const j = Math.min(last - 1, Math.floor(f));
    return mixFigures(frames[j]!, frames[j + 1]!, f - j);
  });
}
