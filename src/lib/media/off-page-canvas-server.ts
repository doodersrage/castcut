/**
 * @napi-rs/canvas as the canvas off the page (off-page-canvas.ts). Server code only: importing it
 * registers it; the browser must never bundle this native module.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { setOffPageCanvas } from './off-page-canvas';

setOffPageCanvas({
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
