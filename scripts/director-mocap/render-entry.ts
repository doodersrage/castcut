// Browser entry for render.mts: a direction's frames through the Director's own camera framing
// and driving-video renderer (render-client.ts), as the Director sheet renders them.
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { frameDirection, type StillFraming } from '@/lib/director/framing';
import { renderDrivingVideo } from '@/lib/director/render-client';
import { DEFAULT_DIRECTOR_CAMERA, type DirectorCamera } from '@/lib/director/types';

declare global {
  interface Window {
    renderMove: (
      frames: PoseRig3dFigure[],
      still: StillFraming | null,
      width: number,
      height: number,
      body?: Rig3dBodyKind,
      hold?: boolean,
      camera?: DirectorCamera,
      fps?: number,
      framingFrames?: PoseRig3dFigure[]
    ) => Promise<string>;
  }
}

window.renderMove = async (
  frames,
  still,
  width,
  height,
  body = 'female',
  hold = false,
  camera = DEFAULT_DIRECTOR_CAMERA,
  fps?: number,
  framingFrames?: PoseRig3dFigure[]
) => {
  const framing = frameDirection({
    frames: framingFrames ?? frames,
    camera,
    aspect: width / height,
    still,
    hold,
  });
  const blob = await renderDrivingVideo({ frames, framing, body, width, height, fps });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
};
