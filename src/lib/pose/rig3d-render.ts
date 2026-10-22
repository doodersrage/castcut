/**
 * A pose as a picture: the posed base bodies, in neutral clay on a plain light background,
 * through the pose's own camera at the picture's aspect — a "pose picture" for engines that
 * follow a reference image better than a skeleton map. Not wired into any graph yet.
 */

import { Color, Scene, WebGLRenderer } from 'three';
import type { PhotoPose } from '@/lib/pose/types';
import { DEFAULT_CAMERA, liftBodies, makeCamera, rigProjectionError } from '@/lib/pose/rig3d-pose';
import { posturesForVision } from '@/lib/pose/rig3d-posture-points';
import type { PoseRig3d } from '@/lib/pose/rig3d';
import {
  addStudioLights,
  applyFigure,
  createFigureObject,
  disposeFigureObject,
} from '@/lib/pose/rig3d-three';

export const POSE_PICTURE_BACKGROUND = 0xf3f2ef;

/** The rig a pose is drawn with: its own when it still matches its points, else lifted from them. */
export function rigForPose(pose: PhotoPose): PoseRig3d {
  if (pose.rig3d && rigProjectionError(pose.rig3d, pose.people, pose.aspect) < 0.01) {
    return pose.rig3d;
  }
  // The lead's posture as the vision model read it from the photo, when it did.
  const postures = posturesForVision(pose.posture?.posture);
  return liftBodies(pose.people, pose.aspect, [], DEFAULT_CAMERA, { postures: [postures] });
}

/**
 * Render a pose to a PNG. `height` sets the size (the width follows the pose's aspect; both are
 * kept to multiples of 8 and at most 2048).
 */
export async function renderPosePicture(
  pose: PhotoPose,
  { height = 1024 }: { height?: number } = {}
): Promise<Blob> {
  const rig = rigForPose(pose);
  const h = Math.max(64, Math.min(2048, Math.round(height / 8) * 8));
  const w = Math.max(64, Math.min(2048, Math.round((h * pose.aspect) / 8) * 8));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    const scene = new Scene();
    scene.background = new Color(POSE_PICTURE_BACKGROUND);
    const camera = makeCamera(rig.camera, w / h);
    addStudioLights(scene, camera);
    const figures = await Promise.all(
      rig.figures.map(async figure => {
        const object = await createFigureObject(figure.body);
        applyFigure(object, figure);
        scene.add(object.root);
        return object;
      })
    );
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    figures.forEach(disposeFigureObject);
    if (!blob) throw new Error('Could not render the pose picture.');
    return blob;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
