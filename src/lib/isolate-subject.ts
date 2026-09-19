import { IDENTITY_MEDIA_URL } from './gallery-media-client';

export const ISOLATE_FILL_WHITE = { r: 255, g: 255, b: 255 } as const;

/** Mid blue-gray used for Vacation/Suggestive face-break plates (not studio white). */
export const ISOLATE_FILL_NEUTRAL = { r: 197, g: 208, b: 220 } as const;

export type IsolateFillRgb = { r: number; g: number; b: number };

/** Parse `#rrggbb` / `rrggbb` / `r,g,b` into an opaque fill. */
export function parseIsolateFill(value: unknown): IsolateFillRgb | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const hex = trimmed.match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const rgb = trimmed.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (rgb) {
    const r = Number(rgb[1]);
    const g = Number(rgb[2]);
    const b = Number(rgb[3]);
    if ([r, g, b].every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
      return { r, g, b };
    }
  }
  return null;
}

function comfyViewUrl(filename: string, type: 'input' | 'output', comfyUrl?: string): string {
  const params = new URLSearchParams({
    filename,
    subfolder: '',
    type,
  });
  const host = comfyUrl?.trim().replace(/\/+$/, '');
  if (host) {
    params.set('comfyUrl', host);
  }
  return `/api/comfyui/view?${params.toString()}`;
}

/** Fetch candidates for a photo that is already in Roleplay (cache, identity lock, or Comfy input). */
export function collectIsolateSourceUrls(input: {
  imageUrl?: string;
  filename?: string;
  comfyUrl?: string;
}): string[] {
  const urls: string[] = [];
  const push = (url?: string) => {
    const trimmed = url?.trim();
    if (!trimmed || urls.includes(trimmed)) {
      return;
    }
    urls.push(trimmed);
  };
  push(input.imageUrl);
  push(IDENTITY_MEDIA_URL);
  const filename = input.filename?.trim();
  if (filename) {
    push(comfyViewUrl(filename, 'input', input.comfyUrl));
    push(comfyViewUrl(filename, 'output', input.comfyUrl));
  }
  return urls;
}

export async function loadImageBlobFromUrls(urls: string[]): Promise<Blob> {
  let lastError: Error | null = null;
  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const response = await fetch(trimmed);
      if (!response.ok) {
        lastError = new Error(`Could not load that photo to isolate (HTTP ${response.status}).`);
        continue;
      }
      const blob = await response.blob();
      if (blob.size === 0) {
        continue;
      }
      return blob;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Could not load that photo to isolate.');
    }
  }
  throw lastError ?? new Error('Could not load that photo to isolate.');
}

/** Default on; only an explicit falsey flag turns isolation off. */
export function normalizeIsolateSubject(value: unknown): boolean {
  return value !== false && value !== 'false' && value !== 0;
}

/** Alpha-composite RGBA onto an opaque fill (white plate for img2img). */
export function compositeRgbaOnFill(
  src: Uint8ClampedArray,
  fill: { r: number; g: number; b: number } = ISOLATE_FILL_WHITE
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const alpha = (src[i + 3] ?? 0) / 255;
    const inv = 1 - alpha;
    out[i] = Math.round((src[i] ?? 0) * alpha + fill.r * inv);
    out[i + 1] = Math.round((src[i + 1] ?? 0) * alpha + fill.g * inv);
    out[i + 2] = Math.round((src[i + 2] ?? 0) * alpha + fill.b * inv);
    out[i + 3] = 255;
  }
  return out;
}

function cutoutFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'roleplay-ref';
  return `${base}-cutout.png`;
}

export const ISOLATE_QUEUE_BLOCKED_MESSAGE =
  'Isolate on white is on, but the photo still has its original background. Wait for the cut-out, or turn Isolate off to queue the original scene.';

/** True when the alpha channel actually punched a hole in the background. */
export function cutoutLooksIsolated(data: Uint8ClampedArray): boolean {
  const pixels = Math.floor(data.length / 4);
  if (pixels < 16) {
    return false;
  }
  let background = 0;
  let subject = 0;
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i] ?? 0;
    if (alpha < 48) {
      background += 1;
    } else if (alpha > 160) {
      subject += 1;
    }
  }
  return background >= pixels * 0.02 && subject >= pixels * 0.02;
}

/**
 * Cut the subject out and flatten onto white via the studio isolate API
 * (Node MODNet — browser ONNX cannot load inside Next).
 */
export async function isolateSubjectOnWhite(source: Blob, filename: string): Promise<File> {
  return isolateSubjectOnFill(source, filename, ISOLATE_FILL_WHITE);
}

/**
 * Cut the subject out and flatten onto an opaque fill (white or mid-gray).
 */
export async function isolateSubjectOnFill(
  source: Blob,
  filename: string,
  fill: IsolateFillRgb = ISOLATE_FILL_WHITE
): Promise<File> {
  const body = new FormData();
  const uploadName = filename.trim() || 'isolate.png';
  body.append('image', source, uploadName);
  body.append('fill', `${fill.r},${fill.g},${fill.b}`);
  const response = await fetch('/api/isolate-subject', {
    method: 'POST',
    credentials: 'same-origin',
    body,
  });
  if (!response.ok) {
    let message = 'Could not isolate the subject.';
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error?.trim()) {
        message = data.error.trim();
      }
    } catch {
      // keep default
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('Could not isolate the subject.');
  }
  return new File([blob], cutoutFilename(uploadName), {
    type: 'image/png',
    lastModified: Date.now(),
  });
}
