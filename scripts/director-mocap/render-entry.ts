// Browser entry for render.mts: a direction's frames through the Director's own camera framing
// and driving-video renderer (render-client.ts), as the Director sheet renders them.
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { frameDirection, type StillFraming } from '@/lib/director/framing';
import { renderDrivingVideo } from '@/lib/director/render-client';
import { DEFAULT_DIRECTOR_CAMERA } from '@/lib/director/types';

declare global {
  interface Window {
    renderMove: (
      frames: PoseRig3dFigure[],
      still: StillFraming | null,
      width: number,
      height: number,
      body?: Rig3dBodyKind
    ) => Promise<string>;
  }
}

window.renderMove = async (frames, still, width, height, body = 'female') => {
  const framing = frameDirection({
    frames,
    camera: DEFAULT_DIRECTOR_CAMERA,
    aspect: width / height,
    still,
  });
  const blob = await renderDrivingVideo({ frames, framing, body, width, height });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
};
