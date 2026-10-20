/** Target size for engine uploads — stay under Next/proxy ~10MB JSON bodies. */
const DEFAULT_MAX_EDGE = 2048;
/** Multipart tolerates larger files than JSON data-URL (~9MB). Prefer originals. */
const DEFAULT_MAX_BYTES = 7_000_000;
const DEFAULT_QUALITY = 0.92;

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return 'jpg';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  return 'png';
}

function renameWithExtension(name: string, mimeType: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'prompt-studio-upload';
  return `${base}.${extensionForMime(mimeType)}`;
}

function sourcePrefersLossless(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === 'image/png' ||
    type === 'image/webp' ||
    type === '' ||
    type === 'application/octet-stream' ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  );
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('Could not compress image.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  options?: { fillWhite?: boolean }
): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  if (options?.fillWhite) {
    // JPEG has no alpha — white avoids black fringing on soft edges / cutouts.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * Downscale / recompress a browser File so Compose/Refine uploads fit Next body
 * limits (JSON truncates around 10MB; base64 inflates ~33%).
 *
 * Prefer keeping original bytes when under limits — lossy JPEG of AI gallery
 * outputs is a common source of garbled edit results.
 */
export async function compressImageForEngineUpload(
  file: File,
  options?: {
    maxEdge?: number;
    maxBytes?: number;
    quality?: number;
  }
): Promise<File> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  let quality = options?.quality ?? DEFAULT_QUALITY;

  if (!file.type.startsWith('image/') && file.type !== 'application/octet-stream') {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const needsDownscale = Math.max(srcW, srcH) > maxEdge;
  const needsShrinkForBytes = file.size > maxBytes;

  // Already small enough — keep original bytes/format (no canvas round-trip).
  if (!needsDownscale && !needsShrinkForBytes) {
    bitmap.close();
    return file;
  }

  const scale = needsDownscale ? Math.min(1, maxEdge / Math.max(srcW, srcH)) : 1;
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  // Prefer lossless when the source was PNG/WebP and the result still fits.
  if (sourcePrefersLossless(file)) {
    const pngCanvas = drawToCanvas(bitmap, width, height);
    if (pngCanvas) {
      try {
        const pngBlob = await canvasToBlob(pngCanvas, 'image/png', 1);
        if (pngBlob.size <= maxBytes) {
          bitmap.close();
          return new File([pngBlob], renameWithExtension(file.name || 'upload', 'image/png'), {
            type: 'image/png',
            lastModified: file.lastModified,
          });
        }
      } catch {
        /* fall through to JPEG */
      }
    }
  }

  const jpegCanvas = drawToCanvas(bitmap, width, height, { fillWhite: true });
  bitmap.close();
  if (!jpegCanvas) {
    return file;
  }

  let mimeType = 'image/jpeg';
  let blob = await canvasToBlob(jpegCanvas, mimeType, quality);
  while (blob.size > maxBytes && quality > 0.55) {
    quality -= 0.08;
    blob = await canvasToBlob(jpegCanvas, mimeType, quality);
  }

  // Last resort: shrink canvas further.
  if (blob.size > maxBytes) {
    const shrink = Math.sqrt(maxBytes / blob.size) * 0.92;
    const w2 = Math.max(1, Math.round(jpegCanvas.width * shrink));
    const h2 = Math.max(1, Math.round(jpegCanvas.height * shrink));
    const canvas2 = drawToCanvas(jpegCanvas, w2, h2, { fillWhite: true });
    if (canvas2) {
      blob = await canvasToBlob(canvas2, 'image/jpeg', 0.8);
      mimeType = 'image/jpeg';
    }
  }

  if (blob.size >= file.size && file.size <= maxBytes * 1.2 && !needsDownscale) {
    return file;
  }

  return new File([blob], renameWithExtension(file.name || 'upload', mimeType), {
    type: mimeType,
    lastModified: file.lastModified,
  });
}
