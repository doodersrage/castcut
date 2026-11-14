/**
 * Decoding and drawing pictures where there is no page (FINISHING_PLAN Phase 3, step 5): the
 * take's image work — pose guides, face crops, the footwear reference — runs the same drawing
 * calls on the server through @napi-rs/canvas (Skia, as Chrome's canvas), registered by
 * off-page-canvas-server.ts. The browser never imports that native module; here it uses its own
 * canvas.
 */

export type OffPageImage = {
  width: number;
  height: number;
  source: CanvasImageSource;
  close: () => void;
};

export type OffPageCanvas = {
  decode: (blob: Blob) => Promise<OffPageImage>;
  canvas: (
    width: number,
    height: number
  ) => { ctx: CanvasRenderingContext2D; toPng: () => Promise<Uint8Array> };
};

let registered: OffPageCanvas | null = null;

/** The server's canvas (off-page-canvas-server.ts); null to clear it. */
export function setOffPageCanvas(canvas: OffPageCanvas | null): void {
  registered = canvas;
}

const pageCanvas = (what: string): OffPageCanvas => ({
  decode: async blob => {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close(),
    };
  },
  canvas: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`Could not ${what}.`);
    return {
      ctx,
      toPng: () =>
        new Promise<Uint8Array>((resolve, reject) => {
          canvas.toBlob(out => {
            if (!out) {
              reject(new Error(`Could not encode the ${what} result.`));
              return;
            }
            void out.arrayBuffer().then(buffer => resolve(new Uint8Array(buffer)), reject);
          }, 'image/png');
        }),
    };
  },
});

/** A server canvas is registered (off-page-canvas-server.ts). */
export function hasOffPageCanvas(): boolean {
  return registered !== null;
}

/** The page's canvas, else the one registered for the server. `what` names the work in errors. */
export function drawingCanvas(what: string): OffPageCanvas {
  if (typeof document !== 'undefined' && typeof createImageBitmap === 'function') {
    return pageCanvas(what);
  }
  if (registered) return registered;
  throw new Error(
    `${what[0]!.toUpperCase()}${what.slice(1)} needs createImageBitmap in this browser.`
  );
}
