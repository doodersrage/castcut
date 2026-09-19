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
  /** Fraction of source height used for the crop window (default 0.26). */
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
  const heightRatio = clamp(options?.heightRatio ?? 0.26, 0.12, 0.4);
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

/** Browser: crop a blob to the geometric face window and return a PNG File. */
export async function cropPortraitFaceRegionFromBlob(
  blob: Blob,
  filename = 'cast-face-crop.png',
  options?: PortraitFaceCropOptions
): Promise<File> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('Face crop needs createImageBitmap in this browser.');
  }
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width < 32 || bitmap.height < 32) {
      throw new Error('Source image is too small to crop a face region.');
    }
    const rect = computePortraitFaceCropRect(bitmap.width, bitmap.height, options);
    const minPixels =
      options?.minPixels === undefined ? PORTRAIT_FACE_CROP_MIN_PIXELS : options.minPixels;
    const outSize = computeMinPixelUpscaleSize(rect.width, rect.height, minPixels);
    const canvas = document.createElement('canvas');
    canvas.width = outSize.width;
    canvas.height = outSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not crop face region.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      outSize.width,
      outSize.height
    );
    const cropped = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(out => {
        if (!out) {
          reject(new Error('Could not encode face crop.'));
          return;
        }
        resolve(out);
      }, 'image/png');
    });
    const safeName = filename.trim() || 'cast-face-crop.png';
    const withExt = /\.png$/i.test(safeName) ? safeName : `${safeName}.png`;
    return new File([cropped], withExt, { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
