/**
 * Geometric top-center face crop for full-body Cast plates.
 * No ML — Cast underwear plates put the head in the upper ~25% of the frame;
 * cropping there keeps likeness without bra/panty pixels on Image 1 / IP-Adapter.
 */

/** Phr00t Rapid AIO Edit loses outfit-edit adherence below ~1MP source pixels. */
export const PORTRAIT_FACE_CROP_MIN_PIXELS = 1_100_000;

export type PortraitFaceCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PortraitFaceCropOptions = {
  /**
   * Fraction of source height used for the crop window (default 0.26, at most 0.75). The cap was
   * 0.4 until 2026-11-11: the partner stand-in asked 0.58 of a head-and-shoulders portrait and got
   * the top 40% — a forehead, which every face check refused.
   */
  heightRatio?: number;
  /** Crop width as a fraction of crop height (default 0.92 — slightly tall portrait). */
  aspect?: number;
  /** Top inset as a fraction of source height (default 0.015). */
  topInsetRatio?: number;
  /**
   * Upscale the crop to at least this many pixels before encode (default
   * {@link PORTRAIT_FACE_CROP_MIN_PIXELS}). Pass 0 to skip.
   */
  minPixels?: number;
};

/**
 * Top-center head/shoulders rect for a full-body standing or kneeling plate.
 * Keeps the window above the chest on typical Cast underwear plates.
 */
export function computePortraitFaceCropRect(
  width: number,
  height: number,
  options?: PortraitFaceCropOptions
): PortraitFaceCropRect {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const heightRatio = clamp(options?.heightRatio ?? 0.26, 0.12, 0.75);
  const aspect = clamp(options?.aspect ?? 0.92, 0.6, 1.2);
  const topInsetRatio = clamp(options?.topInsetRatio ?? 0.015, 0, 0.08);

  let cropH = Math.max(64, Math.round(h * heightRatio));
  let cropW = Math.max(64, Math.round(cropH * aspect));
  if (cropW > w) {
    cropW = w;
    cropH = Math.max(64, Math.round(cropW / aspect));
  }
  if (cropH > h) {
    cropH = h;
    cropW = Math.min(w, Math.max(64, Math.round(cropH * aspect)));
  }

  const x = Math.max(0, Math.round((w - cropW) / 2));
  const y = Math.max(0, Math.min(Math.round(h * topInsetRatio), h - cropH));
  return {
    x,
    y,
    width: Math.min(cropW, w - x),
    height: Math.min(cropH, h - y),
  };
}

/** A face found on the plate (InsightFace box, source pixels). */
export type FaceBox = { x: number; y: number; width: number; height: number };

/** Padded square around a detected face: head, hair and a little neck (see cropFaceBox). */
export const FACE_BOX_CROP_SCALE = 2.2;

/**
 * Square crop centred on a detected face, `scale` × its longer side, nudged up a little so the
 * hair is in (the box runs brow to chin). Shifted, never cut, to stay inside the image; shrunk
 * only when the image is smaller than the square. Works for any plate orientation: a plate where
 * she lies down puts her face low in the frame, where the top-centre window finds only hair.
 */
export function computeFaceBoxCropRect(
  width: number,
  height: number,
  face: FaceBox,
  options?: { scale?: number; liftRatio?: number }
): PortraitFaceCropRect {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const scale = clamp(options?.scale ?? FACE_BOX_CROP_SCALE, 1, 4);
  const lift = clamp(options?.liftRatio ?? 0.12, 0, 0.5);
  const faceW = Math.max(1, face.width);
  const faceH = Math.max(1, face.height);
  const side = Math.min(w, h, Math.max(64, Math.round(Math.max(faceW, faceH) * scale)));
  const centerX = face.x + faceW / 2;
  const centerY = face.y + faceH / 2 - faceH * lift;
  const x = Math.round(Math.min(Math.max(0, centerX - side / 2), w - side));
  const y = Math.round(Math.min(Math.max(0, centerY - side / 2), h - side));
  return { x, y, width: side, height: side };
}

/**
 * Scale W×H up so area ≥ minPixels (8-aligned). No-op when already large enough.
 */
export function computeMinPixelUpscaleSize(
  width: number,
  height: number,
  minPixels = PORTRAIT_FACE_CROP_MIN_PIXELS
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (!Number.isFinite(minPixels) || minPixels <= 0 || w * h >= minPixels) {
    return { width: w, height: h };
  }
  const scale = Math.sqrt(minPixels / (w * h));
  const snap = (value: number) => Math.max(64, Math.round((value * scale) / 8) * 8);
  return { width: snap(w), height: snap(h) };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Decoding and drawing off the page (FINISHING_PLAN Phase 3, step 5): the server crops and
 * composites with @napi-rs/canvas (Skia, as Chrome's canvas), registered by
 * portrait-face-crop-server.ts — never imported by the browser. The same drawing calls run on it.
 */
export type FaceImageCanvas = {
  decode: (
    blob: Blob
  ) => Promise<{ width: number; height: number; source: CanvasImageSource; close: () => void }>;
  canvas: (
    width: number,
    height: number
  ) => { ctx: CanvasRenderingContext2D; toPng: () => Promise<Uint8Array> };
};

let offPageImages: FaceImageCanvas | null = null;

export function setFaceImageCanvas(provider: FaceImageCanvas | null): void {
  offPageImages = provider;
}

/** The page's canvas, else the one registered for the server. */
function imageCanvas(what: string): FaceImageCanvas {
  if (typeof document !== 'undefined' && typeof createImageBitmap === 'function') {
    return {
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
    };
  }
  if (offPageImages) return offPageImages;
  throw new Error(
    `${what[0]!.toUpperCase()}${what.slice(1)} needs createImageBitmap in this browser.`
  );
}

/** Browser: crop a blob to the geometric face window and return a PNG File. */
export async function cropPortraitFaceRegionFromBlob(
  blob: Blob,
  filename = 'cast-face-crop.png',
  options?: PortraitFaceCropOptions
): Promise<File> {
  return cropBlobRegion(
    blob,
    filename,
    (width, height) => computePortraitFaceCropRect(width, height, options),
    options?.minPixels
  );
}

/** Browser: crop a blob to a padded square around a detected face (computeFaceBoxCropRect). */
export async function cropFaceBoxFromBlob(
  blob: Blob,
  filename: string,
  face: FaceBox,
  options?: { scale?: number; liftRatio?: number; minPixels?: number }
): Promise<File> {
  return cropBlobRegion(
    blob,
    filename,
    (width, height) => computeFaceBoxCropRect(width, height, face, options),
    options?.minPixels
  );
}

async function cropBlobRegion(
  blob: Blob,
  filename: string,
  pickRect: (width: number, height: number) => PortraitFaceCropRect,
  minPixelsOption: number | undefined
): Promise<File> {
  const images = imageCanvas('crop face region');
  const bitmap = await images.decode(blob);
  try {
    if (bitmap.width < 32 || bitmap.height < 32) {
      throw new Error('Source image is too small to crop a face region.');
    }
    const rect = pickRect(bitmap.width, bitmap.height);
    const minPixels =
      minPixelsOption === undefined ? PORTRAIT_FACE_CROP_MIN_PIXELS : minPixelsOption;
    const outSize = computeMinPixelUpscaleSize(rect.width, rect.height, minPixels);
    const { ctx, toPng } = images.canvas(outSize.width, outSize.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap.source,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      outSize.width,
      outSize.height
    );
    const cropped = await toPng();
    const safeName = filename.trim() || 'cast-face-crop.png';
    const withExt = /\.png$/i.test(safeName) ? safeName : `${safeName}.png`;
    return new File([cropped as BlobPart], withExt, { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}

/**
 * Soft non-white plate behind a face crop / Cast face lock.
 * Pure white Image 1 + white Image 2/3 teaches Edit-2511 a studio void.
 */
export const DAY_FACE_BREAK_NEUTRAL_BACKDROP = '#c5d0dc';

/**
 * Browser: paint an opaque mid blue-gray behind a portrait blob so VL Image 1
 * does not encode a blank white studio.
 */
export async function compositePortraitOnNeutralBackdrop(
  blob: Blob,
  filename = 'day-face-neutral.png',
  options?: { fill?: string; coverRatio?: number }
): Promise<File> {
  const images = imageCanvas('composite face on neutral backdrop');
  const bitmap = await images.decode(blob);
  try {
    const fill = options?.fill?.trim() || DAY_FACE_BREAK_NEUTRAL_BACKDROP;
    const coverRatio = clamp(options?.coverRatio ?? 0.92, 0.6, 1);
    const outW = Math.max(512, bitmap.width);
    const outH = Math.max(512, bitmap.height);
    const { ctx, toPng } = images.canvas(outW, outH);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, outW, outH);
    const scale = Math.min((outW * coverRatio) / bitmap.width, (outH * coverRatio) / bitmap.height);
    const dw = Math.max(1, Math.round(bitmap.width * scale));
    const dh = Math.max(1, Math.round(bitmap.height * scale));
    const dx = Math.round((outW - dw) / 2);
    const dy = Math.round((outH - dh) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap.source, dx, dy, dw, dh);
    const out = await toPng();
    const safeName = filename.trim() || 'day-face-neutral.png';
    const withExt = /\.png$/i.test(safeName) ? safeName : `${safeName}.png`;
    return new File([out as BlobPart], withExt, { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
