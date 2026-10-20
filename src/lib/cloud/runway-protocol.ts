export type RunwayJobStatusName = 'pending' | 'running' | 'completed' | 'error';

/** Runway model ids are snake/dot tokens (gen4_image, gen4.5, aleph2, …). */
const RUNWAY_MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const RUNWAY_TASK_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMAGE_RATIOS: Array<[number, string]> = [
  [1, '1024:1024'],
  [16 / 9, '1920:1080'],
  [9 / 16, '1080:1920'],
  [4 / 3, '1440:1080'],
  [3 / 4, '1080:1440'],
  [3 / 2, '1168:880'],
  [2 / 3, '720:960'],
  [21 / 9, '2112:912'],
];

const VIDEO_RATIOS: Array<[number, string]> = [
  [16 / 9, '1280:720'],
  [9 / 16, '720:1280'],
  [4 / 3, '1104:832'],
  [3 / 4, '832:1104'],
  [1, '960:960'],
  [21 / 9, '1584:672'],
];

export function sanitizeRunwayModelId(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  if (!RUNWAY_MODEL_ID_RE.test(trimmed)) {
    throw new Error('Runway model id must look like gen4_image or gen4.5.');
  }
  return trimmed;
}

export function encodeRunwayPromptId(modelId: string, taskId: string): string {
  return `${modelId}::${taskId}`;
}

export function isRunwayTaskId(value: string): boolean {
  return RUNWAY_TASK_ID_RE.test(value);
}

export function parseRunwayPromptId(promptId: string): { modelId: string; taskId: string } | null {
  const trimmed = promptId.trim();
  const sep = trimmed.lastIndexOf('::');
  if (sep < 1 || sep === trimmed.length - 2) {
    return null;
  }
  const modelId = trimmed.slice(0, sep);
  const taskId = trimmed.slice(sep + 2);
  if (!RUNWAY_MODEL_ID_RE.test(modelId) || !RUNWAY_TASK_ID_RE.test(taskId)) {
    return null;
  }
  return { modelId, taskId };
}

export function runwayModelToSubfolder(modelId: string): string {
  return modelId.replace(/\./g, '_dot_');
}

export function runwaySubfolderToModel(subfolder: string): string | null {
  const modelId = subfolder.trim().replace(/_dot_/g, '.');
  if (!RUNWAY_MODEL_ID_RE.test(modelId)) {
    return null;
  }
  return modelId;
}

export function mapRunwayTaskStatus(status: string | undefined): RunwayJobStatusName {
  const normalized = status?.trim().toUpperCase() ?? '';
  if (normalized === 'PENDING' || normalized === 'THROTTLED') {
    return 'pending';
  }
  if (normalized === 'RUNNING' || normalized === 'PROCESSING') {
    return 'running';
  }
  if (normalized === 'SUCCEEDED' || normalized === 'COMPLETED' || normalized === 'SUCCESS') {
    return 'completed';
  }
  if (
    normalized === 'FAILED' ||
    normalized === 'ERROR' ||
    normalized === 'CANCELLED' ||
    normalized === 'CANCELED'
  ) {
    return 'error';
  }
  return 'pending';
}

export function isAllowedRunwayMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'runwayml.com' ||
      host.endsWith('.runwayml.com') ||
      host === 'runway.com' ||
      host.endsWith('.runway.com') ||
      host === 'cdn.runwayml.com' ||
      host.endsWith('.amazonaws.com') ||
      host.endsWith('.cloudfront.net')
    );
  } catch {
    return false;
  }
}

function closestRatio(width: number, height: number, options: Array<[number, string]>): string {
  const ratio = width / Math.max(1, height);
  let best = options[0]!;
  let bestDelta = Math.abs(ratio - best[0]);
  for (const option of options) {
    const delta = Math.abs(ratio - option[0]);
    if (delta < bestDelta) {
      best = option;
      bestDelta = delta;
    }
  }
  return best[1];
}

export function runwayImageRatioFromSize(width: number, height: number): string {
  return closestRatio(width, height, IMAGE_RATIOS);
}

export function runwayVideoRatioFromSize(width: number, height: number): string {
  return closestRatio(width, height, VIDEO_RATIOS);
}

/** Gen-4 video duration is typically 2–10s; snap like Fal to 5 or 10. */
export function runwayVideoDurationSec(seconds?: number | null): number {
  const value = Number(seconds);
  if (!Number.isFinite(value)) {
    return 5;
  }
  const clamped = Math.max(2, Math.min(10, Math.round(value)));
  return clamped >= 8 ? 10 : clamped <= 3 ? 2 : 5;
}
