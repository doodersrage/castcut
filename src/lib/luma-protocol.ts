export type LumaJobStatusName = 'pending' | 'running' | 'completed' | 'error';

/** Luma model ids are hyphen/dot tokens (ray-2, ray-flash-2, photon-1, …). */
const LUMA_MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const LUMA_GENERATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ASPECT_RATIOS: Array<[number, string]> = [
  [16 / 9, '16:9'],
  [9 / 16, '9:16'],
  [4 / 3, '4:3'],
  [3 / 4, '3:4'],
  [1, '1:1'],
  [21 / 9, '21:9'],
];

export function sanitizeLumaModelId(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  if (!LUMA_MODEL_ID_RE.test(trimmed)) {
    throw new Error('Luma model id must look like ray-2 or ray-flash-2.');
  }
  return trimmed;
}

export function encodeLumaPromptId(modelId: string, generationId: string): string {
  return `${modelId}::${generationId}`;
}

export function isLumaGenerationId(value: string): boolean {
  return LUMA_GENERATION_ID_RE.test(value);
}

export function parseLumaPromptId(
  promptId: string
): { modelId: string; generationId: string } | null {
  const trimmed = promptId.trim();
  const sep = trimmed.lastIndexOf('::');
  if (sep < 1 || sep === trimmed.length - 2) {
    return null;
  }
  const modelId = trimmed.slice(0, sep);
  const generationId = trimmed.slice(sep + 2);
  if (!LUMA_MODEL_ID_RE.test(modelId) || !LUMA_GENERATION_ID_RE.test(generationId)) {
    return null;
  }
  return { modelId, generationId };
}

export function lumaModelToSubfolder(modelId: string): string {
  return modelId.replace(/\./g, '_dot_');
}

export function lumaSubfolderToModel(subfolder: string): string | null {
  const modelId = subfolder.trim().replace(/_dot_/g, '.');
  if (!LUMA_MODEL_ID_RE.test(modelId)) {
    return null;
  }
  return modelId;
}

export function mapLumaGenerationState(state: string | undefined): LumaJobStatusName {
  const normalized = state?.trim().toLowerCase() ?? '';
  if (normalized === 'queued' || normalized === 'pending') {
    return 'pending';
  }
  if (normalized === 'dreaming' || normalized === 'running' || normalized === 'processing') {
    return 'running';
  }
  if (normalized === 'completed' || normalized === 'succeeded' || normalized === 'success') {
    return 'completed';
  }
  if (normalized === 'failed' || normalized === 'error' || normalized === 'cancelled') {
    return 'error';
  }
  return 'pending';
}

export function isAllowedLumaMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'lumalabs.ai' ||
      host.endsWith('.lumalabs.ai') ||
      host === 'cdn-luma.com' ||
      host.endsWith('.cdn-luma.com') ||
      host === 'storage.cdn-luma.com' ||
      host.endsWith('.amazonaws.com') ||
      host.endsWith('.cloudfront.net')
    );
  } catch {
    return false;
  }
}

function closestAspectRatio(width: number, height: number): string {
  const ratio = width / Math.max(1, height);
  let best = ASPECT_RATIOS[0]!;
  let bestDelta = Math.abs(ratio - best[0]);
  for (const option of ASPECT_RATIOS) {
    const delta = Math.abs(ratio - option[0]);
    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }
  return best[1];
}

export function lumaAspectRatioFromSize(width: number, height: number): string {
  return closestAspectRatio(width, height);
}

/** Ray 2 supports 540p / 720p / 1080p / 4k — pick from the short edge (video height). */
export function lumaResolutionFromSize(width: number, height: number): string {
  const shortEdge = Math.min(width, height);
  if (shortEdge <= 540) {
    return '540p';
  }
  if (shortEdge <= 720) {
    return '720p';
  }
  if (shortEdge <= 1080) {
    return '1080p';
  }
  return '4k';
}

/** Ray 2 duration is 5s or 9s. */
export function lumaVideoDuration(seconds?: number | null): '5s' | '9s' {
  const value = Number(seconds);
  if (!Number.isFinite(value)) {
    return '5s';
  }
  return value >= 7 ? '9s' : '5s';
}
