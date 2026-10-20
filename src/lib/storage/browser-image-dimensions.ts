/**
 * Latent / Empty*Image sizes must be multiples of 16 for Flux2 / Qwen graphs.
 * Prefer rounding to nearest multiple without changing aspect much.
 */
export function snapDimensionToMultiple(value: number, multiple = 16): number {
  if (!Number.isFinite(value) || value <= 0) {
    return multiple;
  }
  const snapped = Math.round(value / multiple) * multiple;
  return Math.max(multiple, snapped);
}

export function snapLatentSize(
  width: number,
  height: number,
  multiple = 16
): { width: number; height: number } {
  return {
    width: snapDimensionToMultiple(width, multiple),
    height: snapDimensionToMultiple(height, multiple),
  };
}

/** Read pixel size from a browser image URL (blob:, data:, or same-origin http). */
export async function probeImageUrlDimensions(
  url: string
): Promise<{ width: number; height: number } | null> {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }
  if (typeof createImageBitmap === 'function') {
    try {
      const response = await fetch(trimmed);
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      if (size.width <= 0 || size.height <= 0) {
        return null;
      }
      return size;
    } catch {
      /* fall through to Image() */
    }
  }
  if (typeof Image === 'undefined') {
    return null;
  }
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight };
      resolve(size.width > 0 && size.height > 0 ? size : null);
    };
    img.onerror = () => resolve(null);
    img.src = trimmed;
  });
}

/** Read pixel size of a browser image File (applies EXIF orientation via ImageBitmap). */
export async function probeImageFileDimensions(
  file: File
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    if (size.width <= 0 || size.height <= 0) {
      return null;
    }
    return size;
  } catch {
    return null;
  }
}
