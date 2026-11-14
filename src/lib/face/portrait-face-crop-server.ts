/**
 * Face crops and the neutral face plate made on the server (FINISHING_PLAN Phase 3, step 5):
 * @napi-rs/canvas registered as portrait-face-crop.ts's canvas off the page. Server code only —
 * the browser uses its own canvas and must never bundle this native module.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { setFaceImageCanvas } from './portrait-face-crop';

setFaceImageCanvas({
  decode: async blob => {
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
    return {
      width: image.width,
      height: image.height,
      source: image as unknown as CanvasImageSource,
      close: () => undefined,
    };
  },
  canvas: (width, height) => {
    const canvas = createCanvas(width, height);
    return {
      ctx: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
      toPng: async () => canvas.toBuffer('image/png'),
    };
  },
});

export {
  compositePortraitOnNeutralBackdrop,
  cropFaceBoxFromBlob,
  cropPortraitFaceRegionFromBlob,
} from './portrait-face-crop';
