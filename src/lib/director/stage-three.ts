/**
 * Director: the 3D stage the driving video is filmed on — the pose body in neutral clay (as the
 * pose picture draws it), a plain light floor with a soft contact shadow, studio light riding
 * with the camera. The live preview and the render both use it. Browser only.
 */

import {
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { PoseRig3dCamera, PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { POSE_PICTURE_BACKGROUND } from '@/lib/pose/rig3d-render';
import {
  addStudioLights,
  applyFigure,
  createFigureObject,
  disposeFigureObject,
  type FigureObject,
} from '@/lib/pose/rig3d-three';

export type DirectorStage = {
  /** Size of the picture in pixels (the canvas's drawing buffer). */
  setSize: (width: number, height: number, pixelRatio?: number) => void;
  /** Pose the body and place the camera, then draw. */
  draw: (figure: PoseRig3dFigure, camera: PoseRig3dCamera) => void;
  dispose: () => void;
};

const FLOOR_COLOR = 0xe4e0da;

export async function createDirectorStage(
  canvas: HTMLCanvasElement,
  body: Rig3dBodyKind,
  options: { capture?: boolean } = {}
): Promise<DirectorStage> {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: Boolean(options.capture),
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const scene = new Scene();
  scene.background = new Color(POSE_PICTURE_BACKGROUND);
  const camera = new PerspectiveCamera(30, 1, 0.05, 100);
  addStudioLights(scene, camera);
  // A floor a shade darker than the background (its far edge reads as the horizon), and a
  // shadow from a light overhead so the feet visibly touch it.
  const floor = new Mesh(new PlaneGeometry(80, 80), new MeshBasicMaterial({ color: FLOOR_COLOR }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shadow = new Mesh(new PlaneGeometry(80, 80), new ShadowMaterial({ opacity: 0.22 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  shadow.receiveShadow = true;
  scene.add(shadow);
  const sun = new DirectionalLight(0xffffff, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 12 });
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  let figure: FigureObject | null = null;
  try {
    figure = await createFigureObject(body);
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  for (const mesh of figure.meshes) mesh.castShadow = true;
  scene.add(figure.root);
  let aspect = 1;
  return {
    setSize(width, height, pixelRatio = 1) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      aspect = width / Math.max(1, height);
    },
    draw(pose, view) {
      if (!figure) return;
      applyFigure(figure, pose);
      // The shadow light follows her, straight above and a little in front.
      const hips = new Vector3(...pose.position);
      sun.position.set(hips.x + 0.6, 6, hips.z + 2.2);
      sun.target.position.set(hips.x, 0, hips.z);
      sun.target.updateMatrixWorld();
      camera.fov = view.fov;
      camera.aspect = aspect;
      camera.position.set(...view.position);
      camera.up.set(0, 1, 0);
      camera.lookAt(new Vector3(...view.target));
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      renderer.render(scene, camera);
    },
    dispose() {
      if (figure) disposeFigureObject(figure);
      figure = null;
      floor.geometry.dispose();
      shadow.geometry.dispose();
      renderer.dispose();
    },
  };
}
