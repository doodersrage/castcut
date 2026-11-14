/**
 * A picture's size as the page reads it, on the server (FINISHING_PLAN Phase 3, step 5): the page
 * decodes it (createImageBitmap, which turns a photo by its EXIF orientation), so a phone JPEG
 * stored on its side reads upright there. readImageSize (image-size.ts) reads the header as
 * stored; this turns it as the page does. Server code only (sharp).
 */
import sharp from 'sharp';
import type { ImageSize } from './image-size';

/** Width and height as the picture shows — EXIF orientations 5–8 swap the sides. */
export async function orientedImageSize(bytes: Uint8Array): Promise<ImageSize | null> {
  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return null;
    return (meta.orientation ?? 1) >= 5
      ? { width: meta.height, height: meta.width }
      : { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/** The size of the picture at `url` (fetched with `fetcher`), or null when it can't be read. */
export async function probeImageUrlSize(
  url: string,
  fetcher: typeof fetch = fetch
): Promise<ImageSize | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const response = await fetcher(trimmed);
    if (!response.ok) return null;
    return orientedImageSize(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}
