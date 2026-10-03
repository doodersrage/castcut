import 'server-only';

import sharp from 'sharp';
import { cutoutLooksIsolated } from './isolate-subject';
import { compositeThroughMask, imageAlreadyOnFill, repairSubjectMask } from './isolate-mask';
import { comfySubjectMask } from './isolate-matte-comfy-server';

const ISOLATE_MODEL_ID = 'Xenova/modnet';
const ISOLATE_DTYPES = ['q8', 'uint8', 'fp32'] as const;

type CutoutRaw = {
  data?: Uint8ClampedArray | Uint8Array;
  width?: number;
  height?: number;
  channels?: number;
};

let segmenterPromise: Promise<(source: Blob) => Promise<CutoutRaw>> | null = null;

function rgbaFromCutout(raw: CutoutRaw): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const width = raw.width ?? 0;
  const height = raw.height ?? 0;
  const src = raw.data;
  if (!src || width < 1 || height < 1) {
    throw new Error('Background removal did not return an image.');
  }
  const channels = raw.channels ?? 4;
  const pixels = width * height;
  if (channels === 4) {
    const data = new Uint8ClampedArray(src.length);
    data.set(src);
    return { data, width, height };
  }
  if (channels === 3) {
    const data = new Uint8ClampedArray(pixels * 4);
    for (let i = 0, o = 0; i < src.length; i += 3, o += 4) {
      data[o] = src[i] ?? 0;
      data[o + 1] = src[i + 1] ?? 0;
      data[o + 2] = src[i + 2] ?? 0;
      data[o + 3] = 255;
    }
    return { data, width, height };
  }
  throw new Error('Background removal did not return an RGBA cut-out.');
}

async function getSegmenter(): Promise<(source: Blob) => Promise<CutoutRaw>> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      let lastError: Error | null = null;
      for (const dtype of ISOLATE_DTYPES) {
        try {
          const segmenter = await pipeline('background-removal', ISOLATE_MODEL_ID, {
            dtype,
          });
          return async (source: Blob) => {
            const output = await segmenter(source);
            const raw = (Array.isArray(output) ? output[0] : output) as CutoutRaw;
            return raw;
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('Could not load the isolate model.');
        }
      }
      throw lastError ?? new Error('Could not load the isolate model.');
    })().catch(err => {
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

export type IsolateMatteSource = 'comfy' | 'modnet' | 'already-on-fill';

export type IsolateMatteOptions = {
  comfyUrl?: string;
  /** 'local' skips ComfyUI and uses MODNet only (tests, offline). */
  matte?: 'auto' | 'local';
};

export type IsolateBufferResult = {
  png: Buffer;
  /** Which matte cut the subject out — or none: the photo already sat on the fill. */
  matte: IsolateMatteSource;
  model?: string;
  filledHolePixels: number;
  regrownPixels: number;
};

/** MODNet's alpha for the photo, at the photo's size. */
async function modnetSubjectMask(source: Blob, width: number, height: number): Promise<Uint8Array> {
  const segment = await getSegmenter();
  const cutout = rgbaFromCutout(await segment(source));
  if (cutout.width === width && cutout.height === height) {
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = cutout.data[i * 4 + 3] ?? 0;
    }
    return mask;
  }
  const alpha = await sharp(Buffer.from(cutout.data), {
    raw: { width: cutout.width, height: cutout.height, channels: 4 },
  })
    .extractChannel(3)
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer();
  return new Uint8Array(alpha);
}

/**
 * Cut the subject out of `source` and flatten it onto an opaque fill (default white).
 *
 * A matte only: the person's pixels are copied from the original, never regenerated. The mask
 * comes from ComfyUI's background removal (BiRefNet) when available, local MODNet otherwise,
 * and is repaired from the photo's colours so dark clothing does not turn into white holes
 * (isolate-mask.ts). A photo that already sits on the fill (an isolated plate fed back in) is
 * kept as is — matting it again only eats into the person.
 */
export async function isolateSubjectOnFillDetailed(
  source: Blob,
  fill: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 },
  options: IsolateMatteOptions = {}
): Promise<IsolateBufferResult> {
  const sourceBytes = Buffer.from(await source.arrayBuffer());
  const decoded = await sharp(sourceBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = decoded.info;
  const rgba = new Uint8ClampedArray(
    decoded.data.buffer,
    decoded.data.byteOffset,
    decoded.data.length
  );
  const encode = (pixels: Uint8ClampedArray) =>
    sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length), {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer();

  if (imageAlreadyOnFill(rgba, width, height, fill)) {
    const solid = new Uint8Array(width * height).fill(255);
    return {
      png: await encode(compositeThroughMask(rgba, solid, fill)),
      matte: 'already-on-fill',
      filledHolePixels: 0,
      regrownPixels: 0,
    };
  }

  let mask: Uint8Array | null = null;
  let matte: IsolateMatteSource = 'modnet';
  let model: string | undefined;
  if (options.matte !== 'local') {
    try {
      const png = await sharp(decoded.data, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer();
      const comfy = await comfySubjectMask({ png, width, height, comfyUrl: options.comfyUrl });
      if (comfy) {
        mask = comfy.mask;
        matte = 'comfy';
        model = comfy.model;
      }
    } catch {
      // ComfyUI down or the run failed — the local matte still works.
      mask = null;
    }
  }
  if (!mask) {
    mask = await modnetSubjectMask(new Blob([new Uint8Array(sourceBytes)]), width, height);
  }

  const repaired = repairSubjectMask(mask, rgba, width, height);
  const maskRgba = new Uint8ClampedArray(repaired.alpha.length * 4);
  for (let i = 0; i < repaired.alpha.length; i++) {
    maskRgba[i * 4 + 3] = repaired.alpha[i]!;
  }
  if (!cutoutLooksIsolated(maskRgba)) {
    throw new Error('Could not cut the subject out of that photo.');
  }
  return {
    png: await encode(compositeThroughMask(rgba, repaired.alpha, fill)),
    matte,
    ...(model ? { model } : {}),
    filledHolePixels: repaired.filledHolePixels,
    regrownPixels: repaired.regrownPixels,
  };
}

/** Subject cut out and flattened onto an opaque fill PNG (default white). */
export async function isolateSubjectOnFillBuffer(
  source: Blob,
  fill: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 },
  options: IsolateMatteOptions = {}
): Promise<Buffer> {
  return (await isolateSubjectOnFillDetailed(source, fill, options)).png;
}

/** Subject cut out and flattened onto an opaque white PNG. */
export async function isolateSubjectOnWhiteBuffer(
  source: Blob,
  options: IsolateMatteOptions = {}
): Promise<Buffer> {
  return isolateSubjectOnFillBuffer(source, { r: 255, g: 255, b: 255 }, options);
}
