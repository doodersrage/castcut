/**
 * Whether a clip URL is a real video (`<video>`) or an animated image (`<img>`). Clips kept in
 * the gallery are served as `/api/gallery/media/<id>` with no extension, so the URL alone cannot
 * tell — a talking clip (MP4 with sound) opened as an `<img>` and showed nothing. The gallery
 * entry's own output file says what it is.
 */

import { loadComfyGallery, type ComfyGalleryEntry } from './comfyui-gallery';

const VIDEO_EXT = /\.(mp4|webm|mov|mkv)(?:[?&#]|$)|format=video/i;
const ANIMATED_IMAGE_EXT = /\.(webp|gif)(?:[?&#]|$)/i;

function entryFileIsVideo(entry: ComfyGalleryEntry): boolean | null {
  const files = entry.images.map(image => image.filename ?? '').filter(Boolean);
  if (files.some(name => VIDEO_EXT.test(name))) return true;
  if (files.some(name => ANIMATED_IMAGE_EXT.test(name))) return false;
  return null;
}

export function clipUrlIsVideo(
  url: string | null | undefined,
  options: { promptId?: string | null; gallery?: ComfyGalleryEntry[] } = {}
): boolean {
  const clip = url?.trim() ?? '';
  if (!clip) return false;
  if (VIDEO_EXT.test(clip)) return true;
  if (ANIMATED_IMAGE_EXT.test(clip)) return false;
  const gallery = options.gallery ?? loadComfyGallery();
  const promptId = options.promptId?.trim();
  const mediaId = clip.match(/\/api\/gallery\/media\/([^/?#]+)/)?.[1];
  const entry = gallery.find(
    item => (promptId && item.promptId === promptId) || (mediaId && item.id === mediaId)
  );
  return entry ? entryFileIsVideo(entry) === true : false;
}
