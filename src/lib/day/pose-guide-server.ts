/**
 * Pose guides drawn on the server (FINISHING_PLAN Phase 3, step 5): @napi-rs/canvas registered as
 * pose-guide.ts's canvas off the page. Import it from server code only — the browser draws on its
 * own canvas and must never bundle this native module.
 */
import { createCanvas } from '@napi-rs/canvas';
import { setPoseGuideCanvasFactory } from './pose-guide';

setPoseGuideCanvasFactory((width, height) => {
  const canvas = createCanvas(width, height);
  return {
    ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
    toPng: async () => canvas.toBuffer('image/png'),
  };
});

export { buildDayPoseGuide } from './pose-guide';
