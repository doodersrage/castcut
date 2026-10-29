/**
 * Director: the driving video's camera. Copy moves scales her to the still, so the render frames
 * her as the still does — her neck and hips at the same height in the picture — and then pulls
 * back (and shifts) just enough that every frame of the move stays inside the picture, camera
 * move included. Without a read of the still it frames the picked shot, as the pose editor's
 * Camera panel does.
 */

import { Vector3 } from 'three';
import type { NormalizedBody } from '@/lib/pose/library';
import type { PoseRig3dCamera, PoseRig3dFigure, Rig3dVec3 } from '@/lib/pose/rig3d';
import { RIG3D_VERSION } from '@/lib/pose/rig3d';
import { figureWorld, makeCamera, openPoseWorld, projectPoint } from '@/lib/pose/rig3d-pose';
import { cameraForChoice, figureFacing } from '@/lib/pose/rig3d-camera';
import type { CameraShot } from '@/lib/pose/camera-shot';
import { ease } from './motion';
import type { DirectorCamera } from './types';

/** Where she is in the still (0–1 of the picture, y down), from a pose read of it. */
export type StillFraming = {
  neckY: number;
  /** Between the hips, when they are in the picture. */
  hipY: number | null;
  centerX: number;
  /** How much of her the still holds. */
  shot: CameraShot;
};

/** The still's framing from the lead's detected points; null without a neck. */
export function readStillFraming(body: NormalizedBody | null | undefined): StillFraming | null {
  const neck = body?.[1];
  if (!body || !neck) return null;
  const seen = (...indices: number[]) => indices.some(index => Boolean(body[index]));
  const hips = [body[8], body[11]].filter((p): p is { x: number; y: number } => Boolean(p));
  const hipY = hips.length ? hips.reduce((sum, p) => sum + p.y, 0) / hips.length : null;
  const hipX = hips.length ? hips.reduce((sum, p) => sum + p.x, 0) / hips.length : neck.x;
  const shot: CameraShot = seen(10, 13)
    ? 'full'
    : seen(9, 12)
      ? 'knees'
      : hipY !== null
        ? 'waist'
        : 'head';
  return {
    neckY: neck.y,
    hipY: hipY !== null && hipY > neck.y + 0.02 ? hipY : null,
    centerX: (neck.x + hipX) / 2,
    shot,
  };
}

/** Margins the whole move must stay inside (0–1 of the picture). */
const MARGIN = { side: 0.03, top: 0.03, bottom: 0.02 };

/**
 * How far inside the picture the move must stay once it is under way, even when the still has
 * her closer to the edge. Copy moves (Wan Animate) scales her to the still at the first frame and
 * then follows the driving video, but draws her shoes below the mannequin's toes and drifts a
 * little: a walk toward the camera whose toes reached the bottom edge came out with her feet cut.
 */
export const MOVE_SAFE = { top: 0.02, bottom: 0.05, side: 0.01 };

/** The points a shot keeps in frame, for one figure (cf. rig3d-camera's shotPoints). */
function shotPoints(figure: PoseRig3dFigure, shot: CameraShot): Vector3[] {
  const world = figureWorld(figure);
  const points = openPoseWorld(figure, world);
  const head = world.pos.head!;
  const up = head.clone().sub(world.pos.neck!);
  if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
  const headTop = head.clone().add(up.normalize().multiplyScalar(0.22));
  const lerp = (a: Vector3, b: Vector3, t: number) => a.clone().lerp(b, t);
  const keep = (indices: number[]) => indices.map(index => points[index]!);
  const face = [0, 14, 15, 16, 17];
  switch (shot) {
    case 'full': {
      // The toes reach past the ankles.
      const toes = (['L', 'R'] as const).map(side =>
        world.pos[`foot_${side}`]!.clone().add(
          new Vector3(0, -0.06, 0.15).applyQuaternion(world.quat[`foot_${side}`]!)
        )
      );
      return [...points, headTop, ...toes];
    }
    case 'knees':
      return [...keep([...face, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]), headTop];
    case 'waist':
      return [
        ...keep([...face, 1, 2, 3, 5, 6, 8, 11]),
        headTop,
        lerp(points[8]!, points[9]!, 0.3),
        lerp(points[11]!, points[12]!, 0.3),
      ];
    case 'head':
      return [...keep([...face, 1, 2, 5]), headTop];
  }
}

const v = (a: Rig3dVec3) => new Vector3(...a);
const arr = (p: Vector3) => p.toArray() as Rig3dVec3;

function axes(camera: PoseRig3dCamera, aspect: number) {
  const cam = makeCamera(camera, aspect);
  const e = cam.matrixWorld.elements;
  const right = new Vector3(e[0], e[1], e[2]).normalize();
  const up = new Vector3(e[4], e[5], e[6]).normalize();
  const distance = v(camera.position).distanceTo(v(camera.target));
  // The picture's height and width, in metres, at the target's distance.
  const height = 2 * distance * Math.tan((camera.fov * Math.PI) / 180 / 2);
  return { cam, right, up, height, width: height * aspect };
}

function shift(camera: PoseRig3dCamera, by: Vector3): PoseRig3dCamera {
  return {
    ...camera,
    position: arr(v(camera.position).add(by)),
    target: arr(v(camera.target).add(by)),
  };
}

/** The camera moved along its line of sight: `scale` > 1 steps back, < 1 closer. */
function dolly(camera: PoseRig3dCamera, scale: number): PoseRig3dCamera {
  const target = v(camera.target);
  return {
    ...camera,
    position: arr(target.clone().add(v(camera.position).sub(target).multiplyScalar(scale))),
  };
}

/** Where a camera move ends, from where it starts. */
export function cameraMoveEnd(
  start: PoseRig3dCamera,
  move: DirectorCamera['move'],
  aspect: number
): PoseRig3dCamera {
  switch (move) {
    case 'push-in':
      return dolly(start, 0.8);
    case 'pull-out':
      return dolly(start, 1.25);
    case 'pan-left':
    case 'pan-right': {
      const { right, width } = axes(start, aspect);
      return shift(start, right.multiplyScalar((move === 'pan-left' ? -0.2 : 0.2) * width));
    }
    default:
      return { ...start, position: [...start.position], target: [...start.target] };
  }
}

/** The camera at `s` (0–1 of the clip): eased from start to end. */
export function cameraAt(start: PoseRig3dCamera, end: PoseRig3dCamera, s: number): PoseRig3dCamera {
  const k = ease(s);
  return {
    fov: start.fov + (end.fov - start.fov) * k,
    position: arr(v(start.position).lerp(v(end.position), k)),
    target: arr(v(start.target).lerp(v(end.target), k)),
  };
}

/** Where she is in the picture through `camera`: neck, between the hips, and her middle. */
function anchors(figure: PoseRig3dFigure, camera: PoseRig3dCamera, aspect: number) {
  const cam = makeCamera(camera, aspect);
  const points = openPoseWorld(figure);
  const neck = projectPoint(cam, points[1]!);
  const hip = projectPoint(cam, points[8]!.clone().lerp(points[11]!, 0.5));
  return { neck, hip, centerX: (neck.x + hip.x) / 2 };
}

/** Her torso's length in the picture (neck to between the hips). */
function torsoLength(figure: PoseRig3dFigure, camera: PoseRig3dCamera, aspect: number): number {
  const { neck, hip } = anchors(figure, camera, aspect);
  return Math.hypot(neck.x - hip.x, neck.y - hip.y);
}

/** How far a held camera may step in or back to keep her size (×), and its smoothing (frames). */
const HELD_SIZE = { min: 0.8, max: 1.25, sigma: 3 };

/**
 * Per frame, the start camera stepped along its line of sight so her torso is the length it is
 * in the first frame (within HELD_SIZE, smoothed so the camera never twitches).
 */
function heldTrack(
  frames: PoseRig3dFigure[],
  start: PoseRig3dCamera,
  aspect: number
): PoseRig3dCamera[] {
  const first = torsoLength(frames[0]!, start, aspect);
  if (!(first > 0.01)) return frames.map(() => start);
  const raw = frames.map(frame => {
    const now = torsoLength(frame, start, aspect);
    return now > 0.01 ? Math.min(HELD_SIZE.max, Math.max(HELD_SIZE.min, now / first)) : 1;
  });
  const reach = Math.ceil(HELD_SIZE.sigma * 3);
  return raw.map((_, i) => {
    let sum = 0;
    let weights = 0;
    for (let k = -reach; k <= reach; k += 1) {
      const w = Math.exp(-(k * k) / (2 * HELD_SIZE.sigma * HELD_SIZE.sigma));
      sum += raw[Math.min(raw.length - 1, Math.max(0, i + k))]! * w;
      weights += w;
    }
    // Twice as big in the picture: the camera twice as far (for the target's distance).
    return dolly(start, sum / weights);
  });
}

/** Line her neck and hips up with the still's (same size and place in the picture). */
function matchStill(
  figure: PoseRig3dFigure,
  camera: PoseRig3dCamera,
  still: StillFraming,
  aspect: number
): PoseRig3dCamera {
  let out = camera;
  for (let step = 0; step < 16; step += 1) {
    const now = anchors(figure, out, aspect);
    if (still.hipY !== null) {
      const have = now.hip.y - now.neck.y;
      const want = still.hipY - still.neckY;
      if (have > 0.01 && want > 0.01) out = dolly(out, Math.min(3, Math.max(0.33, have / want)));
    }
    const after = anchors(figure, out, aspect);
    const { right, up, height, width } = axes(out, aspect);
    const dy = after.neck.y - still.neckY;
    const dx = after.centerX - still.centerX;
    if (Math.abs(dy) < 0.002 && Math.abs(dx) < 0.002 && step > 2) break;
    out = shift(out, up.multiplyScalar(-dy * height).add(right.multiplyScalar(dx * width)));
  }
  return out;
}

/** The picture-space box every frame's kept points fill, camera move included. */
function moveBox(
  frames: PoseRig3dFigure[],
  start: PoseRig3dCamera,
  end: PoseRig3dCamera,
  shot: CameraShot,
  aspect: number
) {
  return pathBox(frames, s => cameraAt(start, end, s), shot, aspect);
}

function pathBox(
  frames: PoseRig3dFigure[],
  cameraAtS: (s: number) => PoseRig3dCamera,
  shot: CameraShot,
  aspect: number
) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const last = Math.max(1, frames.length - 1);
  frames.forEach((figure, i) => {
    const cam = makeCamera(cameraAtS(i / last), aspect);
    for (const point of shotPoints(figure, shot)) {
      const p = projectPoint(cam, point);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  });
  return { minX, maxX, minY, maxY };
}

export type DirectionFraming = {
  start: PoseRig3dCamera;
  end: PoseRig3dCamera;
  /** The shot framed (the still's, for 'picture'). */
  shot: CameraShot;
  /** How much further back than the still's framing the camera stands (1 = the same). */
  pulledBack: number;
  /**
   * Like the still, when the move needs more room than the still has: the clip starts on the
   * still's own framing (she is the size she is in the still) and the camera eases back onto
   * start → end by `settle` (0–1 of the clip), just before the first frame that would not fit.
   */
  from?: PoseRig3dCamera;
  settle?: number;
  /**
   * One camera per frame, when held (a clip continued): each stepped in or back so her torso
   * keeps the size it has in the still — Copy moves sizes her to the driving video's body, and an
   * upright move after a start read leaning (or a step toward the camera) grew her past the clip.
   */
  track?: PoseRig3dCamera[];
};

/** The driving video's camera at `s` (0–1 of the clip). */
export function framingCameraAt(
  framing: Pick<DirectionFraming, 'start' | 'end' | 'from' | 'settle' | 'track'>,
  s: number
): PoseRig3dCamera {
  if (framing.track?.length) {
    const i = Math.round(Math.min(1, Math.max(0, s)) * (framing.track.length - 1));
    return framing.track[i]!;
  }
  const path = cameraAt(framing.start, framing.end, s);
  if (!framing.from) return path;
  return cameraAt(framing.from, path, Math.min(1, s / Math.max(1e-3, framing.settle ?? 1)));
}

/**
 * The driving video's camera for these frames: the picked height, side and lens about her start
 * pose; framed like the still (or the picked shot); then stepped back and shifted until the
 * whole move fits the picture.
 */
export function frameDirection(input: {
  frames: PoseRig3dFigure[];
  camera: DirectorCamera;
  aspect: number;
  still?: StillFraming | null;
  /**
   * Keep the still's framing whatever the move (a clip continued: a pull-back would show at the
   * join); a limb may leave the picture.
   */
  hold?: boolean;
}): DirectionFraming {
  const { frames, camera, aspect } = input;
  const first = frames[0]!;
  const still = camera.shot === 'picture' ? (input.still ?? null) : null;
  const shot: CameraShot = camera.shot === 'picture' ? (input.still?.shot ?? 'full') : camera.shot;
  // A seed camera on the picked side of her, for cameraForChoice to keep.
  const facing = figureFacing(first);
  const left = new Vector3(0, 1, 0).cross(facing).normalize();
  const hips = figureWorld(first).pos.hips!;
  const seed: PoseRig3dCamera = {
    position: arr(
      hips.clone().add(facing.clone().multiplyScalar(4)).add(left.multiplyScalar(camera.side))
    ),
    target: arr(hips),
    fov: 30,
  };
  const picked = cameraForChoice(
    { version: RIG3D_VERSION, figures: [first], camera: seed },
    { height: camera.height, direction: camera.direction, shot, lens: camera.lens },
    aspect
  );
  // Her pose read from the still: the still's own camera (the picks above only name it).
  let start: PoseRig3dCamera = camera.view
    ? { position: [...camera.view.position], target: [...camera.view.target], fov: camera.view.fov }
    : { position: picked.position, target: picked.target, fov: picked.fov };
  // The still's own camera already frames her as the still does.
  if (still && !camera.view) start = matchStill(first, start, still, aspect);
  const matched = start;
  if (input.hold && still) {
    return {
      start,
      end: cameraMoveEnd(start, camera.move, aspect),
      shot,
      pulledBack: 1,
      track: heldTrack(frames, start, aspect),
    };
  }
  const framedDistance = v(start.position).distanceTo(v(start.target));
  // Closer shots crop her legs: only the top and the sides must hold.
  const full = shot === 'full';
  // A still framed tighter than the margins: her start pose may fill it the same way.
  const limit = {
    top: MARGIN.top,
    bottom: 1 - MARGIN.bottom,
    left: MARGIN.side,
    right: 1 - MARGIN.side,
  };
  // Where the move may reach in the picture: inside its safe frame (MOVE_SAFE) — or, framed like
  // the still, as far as the still already has her (a still that crops her head or feet is not
  // pulled back from at the first frame; the move may not reach further out than she starts).
  const reach = {
    top: MOVE_SAFE.top,
    bottom: 1 - MOVE_SAFE.bottom,
    left: MOVE_SAFE.side,
    right: 1 - MOVE_SAFE.side,
  };
  if (still) {
    const first = moveBox([frames[0]!], start, start, shot, aspect);
    reach.top = Math.min(reach.top, first.minY - 0.005);
    reach.bottom = Math.max(reach.bottom, first.maxY + 0.005);
    reach.left = Math.min(reach.left, first.minX - 0.005);
    reach.right = Math.max(reach.right, first.maxX + 0.005);
    limit.top = Math.max(reach.top, Math.min(limit.top, first.minY - 0.005));
    limit.bottom = Math.min(reach.bottom, Math.max(limit.bottom, first.maxY + 0.005));
    limit.left = Math.max(reach.left, Math.min(limit.left, first.minX - 0.005));
    limit.right = Math.min(reach.right, Math.max(limit.right, first.maxX + 0.005));
  }
  for (let step = 0; step < 40; step += 1) {
    const end = cameraMoveEnd(start, camera.move, aspect);
    const box = moveBox(frames, start, end, shot, aspect);
    const overTop = limit.top - box.minY;
    const overBottom = full ? box.maxY - limit.bottom : 0;
    const overLeft = limit.left - box.minX;
    const overRight = box.maxX - limit.right;
    if (Math.max(overTop, overBottom, overLeft, overRight) <= 1e-3) break;
    const wide = (box.maxX - box.minX) / (limit.right - limit.left);
    const tall = full ? (box.maxY - box.minY) / (limit.bottom - limit.top) : 0;
    if (wide > 1 || tall > 1) {
      start = dolly(start, Math.min(1.6, Math.max(wide, tall)) * 1.01);
      continue;
    }
    const { right, up, height, width } = axes(start, aspect);
    const dy = overTop > 0 ? -overTop : Math.max(0, overBottom);
    const dx = overLeft > 0 ? -overLeft : Math.max(0, overRight);
    start = shift(start, up.multiplyScalar(-dy * height).add(right.multiplyScalar(dx * width)));
  }
  const end = cameraMoveEnd(start, camera.move, aspect);
  const out: DirectionFraming = {
    start,
    end,
    shot,
    pulledBack: v(start.position).distanceTo(v(start.target)) / Math.max(1e-6, framedDistance),
  };
  if (!still || v(start.position).distanceTo(v(matched.position)) < 1e-3) return out;
  // Start on the still's framing; ease back only as the move needs it.
  const matchedEnd = cameraMoveEnd(matched, camera.move, aspect);
  const last = Math.max(1, frames.length - 1);
  // How far a frame reaches past the safe frame (0 inside it).
  const over = (box: ReturnType<typeof pathBox>) =>
    Math.max(
      0,
      reach.top - box.minY,
      full ? box.maxY - reach.bottom : 0,
      reach.left - box.minX,
      box.maxX - reach.right
    );
  // The first frame that would leave the safe frame (not just the margins).
  const inPicture = (box: ReturnType<typeof pathBox>) => over(box) <= 0;
  let firstOut = frames.length;
  for (let i = 0; i < frames.length; i += 1) {
    const box = pathBox([frames[i]!], () => cameraAt(matched, matchedEnd, i / last), shot, aspect);
    if (!inPicture(box)) {
      firstOut = i;
      break;
    }
  }
  // She stays in the picture (if not inside its margins) at the still's framing: keep it.
  if (firstOut === frames.length) {
    return { start: matched, end: matchedEnd, shot, pulledBack: 1 };
  }
  // Moving the camera takes time: it is back by the frame before the one that needs it.
  let settle = Math.max(0.12, (firstOut - 1) / last);
  let best: { framing: DirectionFraming; over: number } | null = null;
  for (let tries = 0; tries < 8 && settle >= 0.05; tries += 1) {
    const framing = { ...out, from: matched, settle };
    let worst = 0;
    frames.forEach((frame, i) => {
      worst = Math.max(
        worst,
        over(pathBox([frame], () => framingCameraAt(framing, i / last), shot, aspect))
      );
    });
    if (worst <= 0) return framing;
    if (!best || worst < best.over) best = { framing, over: worst };
    settle *= 0.7;
  }
  // Still start on the still's framing, easing back as fast as it may: a first frame further back
  // than the still is worse — Copy moves scales her back up to the still there, and the whole move
  // with her, so she comes out bigger than the driving video has her and walks out of the picture.
  return best?.framing ?? out;
}
