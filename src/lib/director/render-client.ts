'use client';

/**
 * Director: film the direction in the browser — every frame drawn on the 3D stage, kept as a
 * JPEG, and wrapped in a Motion-JPEG AVI (avi.ts) for Copy moves.
 */

import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { mjpegAvi } from './avi';
import { framingCameraAt, type DirectionFraming } from './framing';
import { createDirectorStage } from './stage-three';
import { DIRECTOR_FPS } from './types';

function jpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) reject(new Error('Could not draw a frame.'));
        else void blob.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
      },
      'image/jpeg',
      0.92
    );
  });
}

export async function renderDrivingVideo(input: {
  frames: PoseRig3dFigure[];
  /** The camera (framing.ts frameDirection). */
  framing: Pick<DirectionFraming, 'start' | 'end' | 'from' | 'settle' | 'track'>;
  body: Rig3dBodyKind;
  width: number;
  height: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** The video's rate (DIRECTOR_FPS unless filmed for a clip's own rate). */
  fps?: number;
}): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = input.width;
  canvas.height = input.height;
  const stage = await createDirectorStage(canvas, input.body, { capture: true });
  try {
    stage.setSize(input.width, input.height, 1);
    const shots: Uint8Array[] = [];
    const last = Math.max(1, input.frames.length - 1);
    for (let i = 0; i < input.frames.length; i += 1) {
      if (input.signal?.aborted) throw new DOMException('Stopped.', 'AbortError');
      stage.draw(input.frames[i]!, framingCameraAt(input.framing, i / last));
      shots.push(await jpeg(canvas));
      input.onProgress?.(i + 1, input.frames.length);
    }
    const avi = mjpegAvi(shots, {
      width: input.width,
      height: input.height,
      fps: input.fps ?? DIRECTOR_FPS,
    });
    return new Blob([avi as BlobPart], { type: 'video/x-msvideo' });
  } finally {
    stage.dispose();
  }
}
