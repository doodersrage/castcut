export type ReplicateJobStatusName = 'pending' | 'running' | 'completed' | 'error';

const REPLICATE_MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,64}\/[a-zA-Z0-9._-]+$/;
const REPLICATE_PREDICTION_ID_RE = /^[a-zA-Z0-9._-]{4,128}$/;

export function sanitizeReplicateModelId(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  if (!REPLICATE_MODEL_ID_RE.test(trimmed)) {
    throw new Error('Replicate model id must look like black-forest-labs/flux-schnell.');
  }
  return trimmed.replace(/^\/+|\/+$/g, '');
}

export function encodeReplicatePromptId(modelId: string, predictionId: string): string {
  return `${modelId}::${predictionId}`;
}

export function isReplicatePredictionId(value: string): boolean {
  return REPLICATE_PREDICTION_ID_RE.test(value);
}

export function parseReplicatePromptId(
  promptId: string
): { modelId: string; predictionId: string } | null {
  const trimmed = promptId.trim();
  const sep = trimmed.lastIndexOf('::');
  if (sep < 1 || sep === trimmed.length - 2) {
    return null;
  }
  const modelId = trimmed.slice(0, sep);
  const predictionId = trimmed.slice(sep + 2);
  if (!REPLICATE_MODEL_ID_RE.test(modelId) || !REPLICATE_PREDICTION_ID_RE.test(predictionId)) {
    return null;
  }
  return { modelId, predictionId };
}

export function replicateModelToSubfolder(modelId: string): string {
  return modelId.replace(/\//g, '--');
}

export function replicateSubfolderToModel(subfolder: string): string | null {
  const modelId = subfolder.trim().replace(/--/g, '/');
  if (!REPLICATE_MODEL_ID_RE.test(modelId)) {
    return null;
  }
  return modelId;
}

export function mapReplicateStatus(status: string | undefined): ReplicateJobStatusName {
  const normalized = status?.trim().toLowerCase() ?? '';
  if (normalized === 'starting' || normalized === 'queued' || normalized === 'pending') {
    return 'pending';
  }
  if (normalized === 'processing' || normalized === 'running') {
    return 'running';
  }
  if (normalized === 'succeeded' || normalized === 'completed' || normalized === 'success') {
    return 'completed';
  }
  if (
    normalized === 'failed' ||
    normalized === 'error' ||
    normalized === 'canceled' ||
    normalized === 'cancelled'
  ) {
    return 'error';
  }
  return 'pending';
}

export function isAllowedReplicateMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'replicate.delivery' ||
      host.endsWith('.replicate.delivery') ||
      host === 'pbxt.replicate.delivery'
    );
  } catch {
    return false;
  }
}

export { aspectRatioFromSize } from '../media/aspect-ratio';
