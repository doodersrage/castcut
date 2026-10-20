import sharp from 'sharp';

const DEFAULT_MAX_EDGE = 1280;
const DEFAULT_JPEG_QUALITY = 85;
/** Keep vision payloads well under Ollama / proxy comfort limits. */
const DEFAULT_MAX_BYTES = 1_500_000;

export type PreparedVisionImage = {
  imageDataUrl: string;
  mimeType: string;
  base64: string;
  width: number;
  height: number;
  bytes: number;
  resized: boolean;
};

function dataUrlFromBuffer(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * Decode a data URL without RegExp capture on multi-MB payloads (V8 can throw
 * RangeError: Maximum call stack size exceeded for `(.+)` on huge strings).
 */
export function splitImageDataUrl(dataUrl: string): {
  mimeType: string;
  base64: string;
} {
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith('data:')) {
    throw new Error('Image must be a base64 data URL (data:image/...;base64,...).');
  }

  const comma = trimmed.indexOf(',');
  if (comma < 0) {
    throw new Error('Image must be a base64 data URL (data:image/...;base64,...).');
  }

  const header = trimmed.slice(5, comma); // after "data:"
  const payload = trimmed.slice(comma + 1);
  if (!/;base64/i.test(header)) {
    throw new Error('Image must be a base64 data URL (data:image/...;base64,...).');
  }

  const mimeType = header.split(';')[0]?.trim() || 'image/jpeg';
  if (!mimeType.startsWith('image/')) {
    throw new Error('Upload must be an image file.');
  }

  return { mimeType, base64: payload };
}

/**
 * Downscale / recompress reference images before vision LLM calls so Ollama and
 * JSON serialize/parse never see multi‑MB camera originals.
 */
export async function prepareVisionImageDataUrl(
  imageDataUrl: string,
  options?: {
    maxEdge?: number;
    quality?: number;
    maxBytes?: number;
  }
): Promise<PreparedVisionImage> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  const { mimeType: sourceMime, base64 } = splitImageDataUrl(imageDataUrl);
  const input = Buffer.from(base64, 'base64');

  let pipeline = sharp(input, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;
  const needsResize = srcWidth > maxEdge || srcHeight > maxEdge || input.length > maxBytes;

  if (needsResize && (srcWidth > 0 || srcHeight > 0)) {
    pipeline = sharp(input, { failOn: 'none' }).rotate().resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    });
  } else {
    pipeline = sharp(input, { failOn: 'none' }).rotate();
  }

  let jpegQuality = quality;
  let output = await pipeline.jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();

  while (output.length > maxBytes && jpegQuality > 45) {
    jpegQuality -= 10;
    output = await sharp(output, { failOn: 'none' })
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toBuffer();
  }

  if (output.length > maxBytes) {
    output = await sharp(output, { failOn: 'none' })
      .resize({
        width: Math.floor(maxEdge * 0.75),
        height: Math.floor(maxEdge * 0.75),
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
  }

  const outMeta = await sharp(output).metadata();
  const mimeType = 'image/jpeg';
  const outBase64 = output.toString('base64');

  return {
    imageDataUrl: dataUrlFromBuffer(output, mimeType),
    mimeType,
    base64: outBase64,
    width: outMeta.width ?? srcWidth,
    height: outMeta.height ?? srcHeight,
    bytes: output.length,
    resized: needsResize || output.length < input.length || sourceMime !== mimeType,
  };
}
