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
  MeshStandardMaterial,
  type Bone,
  type Object3D,
  type Scene,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';

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
};

/** A posable copy of a body, with its own materials (tinted per figure by the editor). */
export async function createFigureObject(kind: Rig3dBodyKind): Promise<FigureObject> {
  const gltf = await loadBody(kind);
  const root = cloneSkinned(gltf.scene);
  const bones = new Map<string, Bone>();
  const meshes: SkinnedMesh[] = [];
  const skin = new MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.78, metalness: 0 });
  const eyes = new MeshStandardMaterial({ color: EYE_COLOR, roughness: 0.4, metalness: 0 });
  root.traverse(node => {
    if ((node as Bone).isBone) bones.set(node.name, node as Bone);
    const mesh = node as SkinnedMesh;
    if (mesh.isSkinnedMesh) {
      const name = Array.isArray(mesh.material) ? '' : mesh.material.name;
      mesh.material = name === 'Eyes' ? eyes : skin;
      // Posed limbs leave the rest pose's bounds: never cull the body.
      mesh.frustumCulled = false;
      meshes.push(mesh);
    }
  });
  return { kind, root, bones, meshes, skin };
}

/** Set a figure's bones (and where its hips are) from the rig. */
export function applyFigure(object: FigureObject, figure: PoseRig3dFigure): void {
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
