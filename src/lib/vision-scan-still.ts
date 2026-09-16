import { compressImageForEngineUpload } from '@/lib/browser-compress-image';
import { fileToDataUrl } from '@/lib/browser-file-data-url';
import { looksLikeVideoUrl } from '@/lib/roleplay-film';
import { extractVideoFirstFrame } from '@/lib/video-last-frame';

const VISION_SCAN_MAX_DATA_URL_CHARS = 11_000_000;

export function looksLikeVideoFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith('video/')) {
    return true;
  }
  return looksLikeVideoUrl(file.name);
}

function isLikelyImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith('image/')) {
    return true;
  }
  if (type && type !== 'application/octet-stream') {
    return false;
  }
  const name = file.name.toLowerCase();
  return /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic|heif)$/.test(name);
}

function blobToJpegFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

async function stillFileFromVideoUrl(url: string, frameName: string): Promise<File> {
  const blob = await extractVideoFirstFrame(url.trim());
  return blobToJpegFile(blob, frameName);
}

async function stillFileFromVideoFile(file: File): Promise<File> {
  const blobUrl = URL.createObjectURL(file);
  try {
    return await stillFileFromVideoUrl(blobUrl, 'vision-frame.jpg');
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function stillFileFromImageUrl(url: string, fallbackName: string): Promise<File> {
  const response = await fetch(url.trim());
  if (!response.ok) {
    throw new Error(`Could not load the still (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (blob.type.startsWith('video/') || looksLikeVideoUrl(url)) {
    return stillFileFromVideoUrl(url, fallbackName);
  }
  if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') {
    throw new Error('Vision scan needs a still image, not a clip.');
  }
  return new File([blob], fallbackName, { type: blob.type || 'image/jpeg' });
}

export type ResolveStillFileForVisionScanOptions = {
  file?: File | null;
  urls?: Array<string | null | undefined>;
  fallbackName?: string;
};

/** Resolve a JPEG still for vision scan — extracts the first frame when given a clip. */
export async function resolveStillFileForVisionScan({
  file,
  urls = [],
  fallbackName = 'vision-still.jpg',
}: ResolveStillFileForVisionScanOptions): Promise<File> {
  if (file) {
    if (looksLikeVideoFile(file)) {
      return compressImageForEngineUpload(await stillFileFromVideoFile(file));
    }
    if (!isLikelyImageFile(file)) {
      throw new Error('Vision scan needs a still image, not a clip.');
    }
    return compressImageForEngineUpload(file);
  }

  for (const raw of urls) {
    const url = raw?.trim();
    if (!url) {
      continue;
    }
    if (looksLikeVideoUrl(url)) {
      return compressImageForEngineUpload(await stillFileFromVideoUrl(url, fallbackName));
    }
    // Absolute http(s)/blob/data, or same-origin relative paths (e.g. /api/comfyui/view?…).
    if (/^(?:https?:|blob:|data:|\/)/i.test(url)) {
      return compressImageForEngineUpload(await stillFileFromImageUrl(url, fallbackName));
    }
  }

  throw new Error('Upload a still, pick from Gallery, or paste an http/data URL before scanning.');
}

export async function prepareVisionScanImagePayload(
  file: File
): Promise<{ image: string; mimeType: string }> {
  const prepared = await compressImageForEngineUpload(file, { maxBytes: 6_000_000 });
  const image = await fileToDataUrl(prepared);
  if (image.length > VISION_SCAN_MAX_DATA_URL_CHARS) {
    throw new Error(
      'Still is too large for vision scan after compression. Try a smaller image or re-pick from Gallery.'
    );
  }
  return { image, mimeType: prepared.type || 'image/jpeg' };
}

export async function parseVisionScanApiResponse<T extends { error?: string }>(
  response: Response
): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('Vision scan returned an empty response.');
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      'Vision scan upload was too large or incomplete. Use a still image or pick a smaller frame from Gallery.'
    );
  }
}
