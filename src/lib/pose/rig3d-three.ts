/**
 * The 3D pose bodies in three.js: loading the base bodies (public/pose-3d, CC0 — see
 * public/pose-3d/LICENSE.md), one posable copy per figure, and setting a copy's bones from a
 * rig. Browser only; shared by the 3D pose editor and the pose picture renderer.
 */

import {
  Color,
  type Camera,
  DirectionalLight,
  HemisphereLight,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
  type Bone,
  type Object3D,
  type Scene,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { boneScale } from '@/lib/pose/rig3d-pose';

export const BODY_URLS: Record<Rig3dBodyKind, string> = {
  female: '/pose-3d/body-female.glb',
  male: '/pose-3d/body-male.glb',
};

/** A neutral clay: the shape reads, nothing else distracts. */
export const SKIN_COLOR = 0xd9cbbf;
export const EYE_COLOR = 0x2a2522;

const loads = new Map<Rig3dBodyKind, Promise<GLTF>>();

export function loadBody(kind: Rig3dBodyKind): Promise<GLTF> {
  let load = loads.get(kind);
  if (!load) {
    load = new GLTFLoader().loadAsync(BODY_URLS[kind]);
    // A failed download may be retried (offline for a moment).
    load.catch(() => loads.delete(kind));
    loads.set(kind, load);
  }
  return load;
}

export type FigureObject = {
  kind: Rig3dBodyKind;
  root: Object3D;
  bones: Map<string, Bone>;
  meshes: SkinnedMesh[];
  skin: MeshStandardMaterial;
  /** Each bone's position in its parent at rest (a longer segment moves its child out). */
  restPositions: Map<string, Vector3>;
  /** Each mesh's bind inverses as loaded (a longer segment stretches its bone's along it). */
  restInverses: Map<SkinnedMesh, Matrix4[]>;
  /** The proportions last applied (to skip the work when they have not changed). */
  scaleKey: string;
};

/** A posable copy of a body, with its own materials (tinted per figure by the editor). */
export async function createFigureObject(kind: Rig3dBodyKind): Promise<FigureObject> {
  const gltf = await loadBody(kind);
  const root = cloneSkinned(gltf.scene);
  const bones = new Map<string, Bone>();
  const meshes: SkinnedMesh[] = [];
  const skin = new MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.78, metalness: 0 });
  const eyes = new MeshStandardMaterial({ color: EYE_COLOR, roughness: 0.4, metalness: 0 });
  const restInverses = new Map<SkinnedMesh, Matrix4[]>();
  root.traverse(node => {
    if ((node as Bone).isBone) bones.set(node.name, node as Bone);
    const mesh = node as SkinnedMesh;
    if (mesh.isSkinnedMesh) {
      const name = Array.isArray(mesh.material) ? '' : mesh.material.name;
      mesh.material = name === 'Eyes' ? eyes : skin;
      // Posed limbs leave the rest pose's bounds: never cull the body.
      mesh.frustumCulled = false;
      // A copy's skeleton shares its bind inverses with the loaded body's: its own, to stretch.
      const inverses = mesh.skeleton.boneInverses.map(m => m.clone());
      mesh.skeleton.boneInverses = inverses.map(m => m.clone());
      restInverses.set(mesh, inverses);
      meshes.push(mesh);
    }
  });
  const restPositions = new Map([...bones].map(([name, bone]) => [name, bone.position.clone()]));
  return { kind, root, bones, meshes, skin, restPositions, restInverses, scaleKey: '' };
}

/**
 * The figure's own segment lengths (rig3d.ts `scale`): each child bone moved out along its
 * parent, and the parent's skin stretched along the bone to meet it (a bone points along its own
 * +y), so a longer thigh is longer, not thicker.
 */
function applyProportions(object: FigureObject, figure: PoseRig3dFigure): void {
  const key = JSON.stringify(figure.scale ?? {});
  if (key === object.scaleKey) return;
  object.scaleKey = key;
  for (const [name, bone] of object.bones) {
    const rest = object.restPositions.get(name);
    if (!rest || name === 'hips') continue;
    const parent = bone.parent && (bone.parent as Bone).isBone ? bone.parent.name : null;
    bone.position.copy(rest).multiplyScalar(parent ? boneScale(figure, parent) : 1);
  }
  for (const mesh of object.meshes) {
    const rest = object.restInverses.get(mesh);
    if (!rest) continue;
    mesh.skeleton.bones.forEach((bone, index) => {
      const s = boneScale(figure, bone.name);
      const inverse = mesh.skeleton.boneInverses[index]!;
      inverse.copy(rest[index]!);
      if (s !== 1) inverse.premultiply(new Matrix4().makeScale(1, s, 1));
    });
  }
}

/** Set a figure's bones (and where its hips are) from the rig. */
export function applyFigure(object: FigureObject, figure: PoseRig3dFigure): void {
  applyProportions(object, figure);
  for (const [name, q] of Object.entries(figure.bones)) {
    object.bones.get(name)?.quaternion.set(q[0], q[1], q[2], q[3]);
  }
  object.bones.get('hips')?.position.set(...figure.position);
  object.root.updateMatrixWorld(true);
}

/**
 * Soft studio light: a sky / ground fill, and a key that rides with the camera (above and to its
 * left), so a back or top view is lit as well as the front.
 */
export function addStudioLights(scene: Scene, camera: Camera): DirectionalLight {
  scene.add(new HemisphereLight(new Color(0xffffff), new Color(0x8a8078), 1.6));
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-1.5, 2, 0.5);
  key.target.position.set(0, 0, -4);
  camera.add(key);
  camera.add(key.target);
  if (!camera.parent) scene.add(camera);
  return key;
}

export function disposeFigureObject(object: FigureObject): void {
  object.skin.dispose();
  for (const mesh of object.meshes) {
    if (!Array.isArray(mesh.material)) mesh.material.dispose();
  }
  object.root.removeFromParent();
}
