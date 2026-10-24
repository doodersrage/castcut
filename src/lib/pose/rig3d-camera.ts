/**
 * The 3D pose editor's Camera panel, as maths: a camera pick (pose/camera-shot.ts — height,
 * direction, shot, lens) turned into the rig's camera, framed on the figures at the picture's
 * aspect; and the other way, a camera (orbited by hand) read back as a pick, so the still's
 * camera words always match the camera the pose map was projected through.
 *
 * Directions are the lead figure's: "front" faces her even when she is turned.
 */

import { PerspectiveCamera, Vector3 } from 'three';
import type { PhotoPose } from '@/lib/pose/types';
import type { PoseRig3d, PoseRig3dCamera, PoseRig3dFigure, Rig3dVec3 } from '@/lib/pose/rig3d';
import {
  cameraElevation,
  figureWorld,
  heightOfElevation,
  makeCamera,
  openPoseWorld,
  projectPoint,
  rigProjectionError,
  turnFigure,
} from '@/lib/pose/rig3d-pose';
import type {
  CameraDirection,
  CameraHeight,
  CameraLens,
  CameraShot,
  FullCameraChoice,
} from '@/lib/pose/camera-shot';

/** Vertical field of view per lens, degrees ("normal" is the editor's long-standing 30°). */
export const CAMERA_LENS_FOV: Record<CameraLens, number> = { wide: 60, normal: 30, long: 15 };

/** How far above the horizontal the camera looks down from (negative: from below), degrees. */
const HEIGHT_ELEVATION: Record<CameraHeight, number> = {
  low: -22,
  eye: 0,
  high: 32,
  overhead: 84,
};

/** How far round from her front the camera stands, degrees. */
const DIRECTION_AZIMUTH: Record<CameraDirection, number> = {
  front: 0,
  'three-quarter': 40,
  side: 90,
  back: 180,
};

/** Share of the picture the framed points may fill (the rest is a margin). */
const FILL = 0.9;

const deg = (radians: number) => (radians * 180) / Math.PI;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The way a figure faces, flat on the ground (unit): square to its hips and shoulders, so a seat
 * or a bend (the hips tipped) still faces where the body does.
 */
export function figureFacing(figure: PoseRig3dFigure): Vector3 {
  const points = openPoseWorld(figure);
  // Her right to her left, across the hips and the shoulders.
  const across = points[11]!.clone().sub(points[8]!).add(points[5]!.clone().sub(points[2]!));
  const forward = across.cross(new Vector3(0, 1, 0));
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) {
    // Across the body is straight up (lying on a side): the hips' own forward.
    forward.set(0, 0, 1).applyQuaternion(figureWorld(figure).quat.hips!);
    forward.y = 0;
  }
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
  return forward.normalize();
}

/**
 * Turn a figure about its vertical axis so its body (hips and shoulders, as figureFacing reads it)
 * faces the camera. The starters ("Stand", "Sit"…) are drawn facing front, but their 2D shoulders
 * are narrower than the rig's, so the lift read them as turned about 37° — "Stand" opened as a
 * three-quarter view.
 */
export function faceCamera(figure: PoseRig3dFigure, camera: PoseRig3dCamera): void {
  const toCamera = new Vector3(...camera.position).sub(new Vector3(...camera.target));
  toCamera.y = 0;
  if (toCamera.lengthSq() < 1e-9) return;
  const forward = figureFacing(figure);
  const angle = Math.atan2(toCamera.x, toCamera.z) - Math.atan2(forward.x, forward.z);
  turnFigure(figure, Math.atan2(Math.sin(angle), Math.cos(angle)));
}

/** The figure's left, flat (unit): the side a positive azimuth turns the camera to. */
function figureLeft(forward: Vector3): Vector3 {
  return new Vector3(0, 1, 0).cross(forward).normalize();
}

/**
 * The points a shot must hold in frame, for one figure: the whole body for a full-body shot;
 * down to just under the knees, the top of the thighs, or mid-chest for the closer ones. The
 * joints below the cut fall out of the picture, and the pose map leaves them out.
 */
function shotPoints(figure: PoseRig3dFigure, shot: CameraShot): Vector3[] {
  const world = figureWorld(figure);
  const points = openPoseWorld(figure, world);
  const head = world.pos.head!;
  const neck = world.pos.neck ?? points[1]!;
  const up = head.clone().sub(neck);
  if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
  const headTop = head.clone().add(up.normalize().multiplyScalar(0.22));
  const lerp = (a: Vector3, b: Vector3, t: number) => a.clone().lerp(b, t);
  const hipMid = lerp(points[8]!, points[11]!, 0.5);
  const keep = (indices: number[]) => indices.map(index => points[index]!);
  const face = [0, 14, 15, 16, 17];
  switch (shot) {
    case 'full':
      return [...points, headTop];
    case 'knees':
      return [
        ...keep([...face, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]),
        headTop,
        lerp(points[9]!, points[10]!, 0.3),
        lerp(points[12]!, points[13]!, 0.3),
      ];
    case 'waist':
      return [
        ...keep([...face, 1, 2, 3, 5, 6, 8, 11]),
        headTop,
        lerp(points[8]!, points[9]!, 0.3),
        lerp(points[11]!, points[12]!, 0.3),
      ];
    case 'head':
      return [...keep([...face, 1, 2, 5]), headTop, lerp(points[1]!, hipMid, 0.4)];
  }
}

/** The camera's right and up axes. */
function cameraAxes(cam: PerspectiveCamera): { right: Vector3; up: Vector3 } {
  const e = cam.matrixWorld.elements;
  return {
    right: new Vector3(e[0], e[1], e[2]).normalize(),
    up: new Vector3(e[4], e[5], e[6]).normalize(),
  };
}

/**
 * Where a camera stands for a pick, looking along `toCamera` (unit, from the subject to the
 * camera): far enough back that the shot's points fill the picture, centred on them.
 */
function fitCamera(
  points: Vector3[],
  toCamera: Vector3,
  fov: number,
  aspect: number
): PoseRig3dCamera {
  const centre = points
    .reduce((sum, point) => sum.add(point), new Vector3())
    .multiplyScalar(1 / Math.max(1, points.length));
  const radius = Math.max(0.15, ...points.map(point => point.distanceTo(centre)));
  const halfV = Math.tan(rad(fov) / 2);
  const halfH = halfV * aspect;
  let distance = Math.min(40, Math.max(0.4, radius / Math.min(halfV, halfH)));
  const camera = (): PoseRig3dCamera => ({
    position: centre.clone().add(toCamera.clone().multiplyScalar(distance)).toArray() as Rig3dVec3,
    target: centre.toArray() as Rig3dVec3,
    fov,
  });
  for (let step = 0; step < 12; step += 1) {
    const cam = makeCamera(camera(), aspect);
    const depthAxis = toCamera.clone();
    const behind = points.some(
      point => point.clone().sub(cam.position).dot(depthAxis) > -0.05 // at or behind the lens
    );
    if (behind) {
      distance = Math.min(40, distance * 1.5);
      continue;
    }
    const ndc = points.map(point => point.clone().project(cam));
    const xs = ndc.map(p => p.x);
    const ys = ndc.map(p => p.y);
    const [minX, maxX, minY, maxY] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...ys),
    ];
    const { right, up } = cameraAxes(cam);
    // Centre the points, then size them to fill the picture.
    centre
      .add(right.multiplyScalar(((minX + maxX) / 2) * halfH * distance))
      .add(up.multiplyScalar(((minY + maxY) / 2) * halfV * distance));
    const scale = Math.max((maxX - minX) / (2 * FILL), (maxY - minY) / (2 * FILL));
    if (Math.abs(scale - 1) < 0.004 && Math.abs(minX + maxX) < 0.01 && Math.abs(minY + maxY) < 0.01)
      break;
    distance = Math.min(40, Math.max(0.3, distance * scale));
  }
  return camera();
}

/**
 * The rig's camera for a pick: the picked height and direction about the lead figure (on the
 * side the camera already stands, for three-quarter and side), the lens's field of view, and
 * framed so the shot's part of every figure fills the picture. The pick rides along on the
 * camera (`choice`) so the words never have to be read back from the numbers.
 */
/**
 * Where the camera stands round the lead now, degrees: 0 in front of her, positive toward her
 * left, ±180 behind (the azimuth a camera pick and a motion-capture view are given in).
 */
export function cameraAzimuthAround(rig: PoseRig3d): number {
  const lead = rig.figures[0];
  if (!lead) return 0;
  const forward = figureFacing(lead);
  const left = figureLeft(forward);
  const toCamera = new Vector3(...rig.camera.position).sub(new Vector3(...rig.camera.target));
  toCamera.y = 0;
  if (toCamera.lengthSq() < 1e-9) return 0;
  return (Math.atan2(toCamera.dot(left), toCamera.dot(forward)) * 180) / Math.PI;
}

/**
 * A rig lifted from a flat picture, turned (the camera orbited or the figure spun) this many
 * degrees from the view it was read in; null when it was not lifted (posed in 3D).
 */
export function turnedFromLiftedView(rig: PoseRig3d): number | null {
  if (!rig.liftedFrom) return null;
  const turn = cameraAzimuthAround(rig) - rig.liftedFrom.azimuthDeg;
  return Math.abs(Math.atan2(Math.sin(rad(turn)), Math.cos(rad(turn))) * (180 / Math.PI));
}

/** The rig marked as lifted from the view its camera has now (see `PoseRig3d.liftedFrom`). */
export function markLiftedView(rig: PoseRig3d, options: { estimated?: boolean } = {}): PoseRig3d {
  return {
    ...rig,
    liftedFrom: {
      azimuthDeg: Math.round(cameraAzimuthAround(rig) * 10) / 10,
      ...(options.estimated ? { estimated: true as const } : {}),
    },
  };
}

/**
 * The camera standing `azimuthDeg` round the lead and `elevationDeg` up (a motion-capture
 * reference's own view), framing every figure whole through the normal lens.
 */
export function cameraFromView(
  rig: PoseRig3d,
  view: { azimuthDeg: number; elevationDeg: number },
  aspect: number,
  fov = CAMERA_LENS_FOV.normal
): PoseRig3dCamera {
  const lead = rig.figures[0];
  if (!lead) return { ...rig.camera };
  const forward = figureFacing(lead);
  const left = figureLeft(forward);
  const az = rad(view.azimuthDeg);
  const el = rad(view.elevationDeg);
  const toCamera = forward
    .clone()
    .multiplyScalar(Math.cos(az))
    .add(left.clone().multiplyScalar(Math.sin(az)))
    .multiplyScalar(Math.cos(el))
    .add(new Vector3(0, Math.sin(el), 0))
    .normalize();
  const points = rig.figures.flatMap(figure => shotPoints(figure, 'full'));
  return fitCamera(points, toCamera, fov, aspect);
}

export function cameraForChoice(
  rig: PoseRig3d,
  choice: FullCameraChoice,
  aspect: number
): PoseRig3dCamera {
  const lead = rig.figures[0];
  if (!lead) {
    const { estimated: _read, ...camera } = rig.camera;
    return { ...camera, choice: { ...choice } };
  }
  const forward = figureFacing(lead);
  const left = figureLeft(forward);
  // Keep the side of her the camera is on now (a three-quarter view from her left stays there).
  const now = new Vector3(...rig.camera.position).sub(new Vector3(...rig.camera.target));
  const side = now.dot(left) < -1e-3 ? -1 : 1;
  const azimuth = rad(DIRECTION_AZIMUTH[choice.direction]) * side;
  const elevation = rad(HEIGHT_ELEVATION[choice.height]);
  const flat = forward
    .clone()
    .multiplyScalar(Math.cos(azimuth))
    .add(left.clone().multiplyScalar(Math.sin(azimuth)));
  const toCamera = flat
    .multiplyScalar(Math.cos(elevation))
    .add(new Vector3(0, Math.sin(elevation), 0))
    .normalize();
  const points = rig.figures.flatMap(figure => shotPoints(figure, choice.shot));
  const camera = fitCamera(points, toCamera, CAMERA_LENS_FOV[choice.lens], aspect);
  return { ...camera, choice: { ...choice } };
}

/** A joint is in the picture (a hair of slack for rounding). */
function inFrame(point: { x: number; y: number }): boolean {
  return point.x >= -0.005 && point.x <= 1.005 && point.y >= -0.005 && point.y <= 1.005;
}

/**
 * A camera read as a pick, from its numbers (orbited or zoomed by hand): how high it looks from,
 * which way round the lead it stands, how much of her the picture holds, and the lens.
 */
/** How high a camera looks from, as a pick (the lift's estimate of a photo's camera, say). */
export function cameraHeightOf(camera: PoseRig3dCamera): CameraHeight {
  return heightOfElevation(cameraElevation(camera));
}

export function readCameraChoice(rig: PoseRig3d, aspect: number): FullCameraChoice {
  const camera = rig.camera;
  const toCamera = new Vector3(...camera.position).sub(new Vector3(...camera.target));
  if (toCamera.lengthSq() < 1e-9) toCamera.set(0, 0, 1);
  toCamera.normalize();
  // A camera the lift read from the picture names no height or lens: it is a fitting aid, not a
  // measurement (lift-check: on the mocap references it reads the height's word no better than
  // eye level), so the still is described as taken at eye level with the normal lens.
  const height = camera.estimated ? 'eye' : cameraHeightOf(camera);
  const lead = rig.figures[0];
  let direction: CameraDirection = 'front';
  let shot: CameraShot = 'full';
  if (lead) {
    const flat = new Vector3(toCamera.x, 0, toCamera.z);
    if (flat.lengthSq() > 1e-6) {
      const turn = deg(
        Math.acos(Math.max(-1, Math.min(1, flat.normalize().dot(figureFacing(lead)))))
      );
      direction =
        turn < 22.5 ? 'front' : turn < 65 ? 'three-quarter' : turn < 125 ? 'side' : 'back';
    }
    const cam = makeCamera(camera, aspect);
    const points = openPoseWorld(lead).map(point => projectPoint(cam, point));
    const seen = (...indices: number[]) => indices.some(index => inFrame(points[index]!));
    shot = seen(10, 13) ? 'full' : seen(9, 12) ? 'knees' : seen(8, 11) ? 'waist' : 'head';
  }
  const lens: CameraLens = camera.estimated
    ? 'normal'
    : camera.fov >= 45
      ? 'wide'
      : camera.fov <= 20
        ? 'long'
        : 'normal';
  return { height, direction, shot, lens };
}

/** The rig's camera as a pick: the one picked in the panel, else read from the numbers. */
export function rigCameraChoice(rig: PoseRig3d, aspect: number): FullCameraChoice {
  return rig.camera.choice ? { ...rig.camera.choice } : readCameraChoice(rig, aspect);
}

/**
 * The camera a saved custom pose was posed through, as a pick — null when the pose has no 3D
 * rig, or its rig no longer draws its points (edited in the wireframe editor since).
 */
export function photoPoseCameraChoice(pose: PhotoPose | null | undefined): FullCameraChoice | null {
  const rig = pose?.rig3d;
  if (!pose || !rig || !pose.people.length) return null;
  if (rigProjectionError(rig, pose.people, pose.aspect) >= 0.01) return null;
  return rigCameraChoice(rig, pose.aspect);
}
