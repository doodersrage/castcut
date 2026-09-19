import 'server-only';

import sharp from 'sharp';
import { compositeRgbaOnFill, cutoutLooksIsolated } from './isolate-subject';

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

/** Node MODNet cutout flattened onto an opaque fill PNG (default white). */
export async function isolateSubjectOnFillBuffer(
  source: Blob,
  fill: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 }
): Promise<Buffer> {
  const segment = await getSegmenter();
  const raw = await segment(source);
  const cutout = rgbaFromCutout(raw);
  if (!cutoutLooksIsolated(cutout.data)) {
    throw new Error('Could not cut the subject out of that photo.');
  }
  const flattened = compositeRgbaOnFill(cutout.data, fill);
  return sharp(Buffer.from(flattened), {
    raw: {
      width: cutout.width,
      height: cutout.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

/** Node MODNet cutout flattened onto an opaque white PNG. */
export async function isolateSubjectOnWhiteBuffer(source: Blob): Promise<Buffer> {
  return isolateSubjectOnFillBuffer(source, { r: 255, g: 255, b: 255 });
}
