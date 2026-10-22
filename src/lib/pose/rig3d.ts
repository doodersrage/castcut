/**
 * The 3D pose editor's rig state, saved on a PhotoPose beside its 18 OpenPose points
 * (`PhotoPose.rig3d`) so reopening the editor restores the body exactly. Only the editor reads
 * it: every other consumer (the pose map, the words, the pose check) keeps reading `people`,
 * which the editor always writes by projecting the rig through its camera.
 *
 * Shared (not Play): My poses and the pose types normalise it.
 */

import { normalizeFullCameraChoice, type FullCameraChoice } from '@/lib/pose/camera-shot';

export const RIG3D_VERSION = 1;

export type Rig3dVec3 = [number, number, number];
export type Rig3dQuat = [number, number, number, number];

/** The base body a figure uses (public/pose-3d/body-*.glb). */
export type Rig3dBodyKind = 'female' | 'male';

export type PoseRig3dFigure = {
  body: Rig3dBodyKind;
  /** The hips bone's position in world space, metres (y up). */
  position: Rig3dVec3;
  /** Each bone's local rotation (x, y, z, w), by bone name; the hips' carries the figure's turn. */
  bones: Record<string, Rig3dQuat>;
};

export type PoseRig3dCamera = {
  position: Rig3dVec3;
  target: Rig3dVec3;
  /** Vertical field of view, degrees. */
  fov: number;
  /**
   * What the camera was picked as in the editor's Camera panel (height, direction, shot, lens),
   * so the words never have to be read back from the numbers. Gone as soon as the camera is
   * orbited or zoomed by hand: then the words come from the numbers (pose/rig3d-camera.ts).
   * Older readers ignore it.
   */
  choice?: FullCameraChoice;
};

export type PoseRig3d = {
  version: typeof RIG3D_VERSION;
  /** One per person, in the same order as `PhotoPose.people`. */
  figures: PoseRig3dFigure[];
  /** The camera the people were projected through, framed to the picture's aspect. */
  camera: PoseRig3dCamera;
};

const BONE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

function finite(value: unknown, limit = 1e3): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

function vec3(raw: unknown, limit = 100): Rig3dVec3 | null {
  return Array.isArray(raw) && raw.length === 3 && raw.every(v => finite(v, limit))
    ? [raw[0], raw[1], raw[2]]
    : null;
}

function quat(raw: unknown): Rig3dQuat | null {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(v => finite(v, 2))) return null;
  const length = Math.hypot(raw[0], raw[1], raw[2], raw[3]);
  if (length < 0.5 || length > 1.5) return null;
  return [raw[0] / length, raw[1] / length, raw[2] / length, raw[3] / length];
}

function figure(raw: unknown): PoseRig3dFigure | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const body = record.body === 'male' ? 'male' : record.body === 'female' ? 'female' : null;
  const position = vec3(record.position);
  if (!body || !position || !record.bones || typeof record.bones !== 'object') return null;
  const bones: Record<string, Rig3dQuat> = {};
  for (const [name, value] of Object.entries(record.bones as Record<string, unknown>).slice(
    0,
    48
  )) {
    const q = quat(value);
    if (BONE_NAME.test(name) && q) bones[name] = q;
  }
  return Object.keys(bones).length ? { body, position, bones } : null;
}

/** A stored rig, checked field by field; undefined when it is not one this version reads. */
export function normalizePoseRig3d(raw: unknown, people?: number): PoseRig3d | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  if (record.version !== RIG3D_VERSION || !Array.isArray(record.figures)) return undefined;
  const figures = record.figures.slice(0, 3).map(figure);
  if (!figures.length || figures.some(entry => !entry)) return undefined;
  if (people != null && figures.length !== people) return undefined;
  const cam = record.camera as Record<string, unknown> | undefined;
  const position = vec3(cam?.position);
  const target = vec3(cam?.target);
  const fov = cam?.fov;
  if (!position || !target || !finite(fov) || fov < 5 || fov > 120) return undefined;
  const choice = normalizeFullCameraChoice(cam?.choice);
  return {
    version: RIG3D_VERSION,
    figures: figures as PoseRig3dFigure[],
    camera: { position, target, fov, ...(choice ? { choice } : {}) },
  };
}
