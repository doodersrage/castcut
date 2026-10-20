export type FalJobStatusName = 'pending' | 'running' | 'completed' | 'error';

const FAL_MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{1,200}$/;
const FAL_REQUEST_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export function sanitizeFalModelId(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  if (!FAL_MODEL_ID_RE.test(trimmed) || !trimmed.includes('/')) {
    throw new Error('Fal model id must look like fal-ai/flux/schnell.');
  }
  return trimmed.replace(/^\/+|\/+$/g, '');
}

export function encodeFalPromptId(modelId: string, requestId: string): string {
  return `${modelId}::${requestId}`;
}

export function isFalRequestId(value: string): boolean {
  return FAL_REQUEST_ID_RE.test(value);
}

export function parseFalPromptId(promptId: string): { modelId: string; requestId: string } | null {
  const trimmed = promptId.trim();
  const sep = trimmed.lastIndexOf('::');
  if (sep < 1 || sep === trimmed.length - 2) {
    return null;
  }
  const modelId = trimmed.slice(0, sep);
  const requestId = trimmed.slice(sep + 2);
  if (
    !FAL_MODEL_ID_RE.test(modelId) ||
    !modelId.includes('/') ||
    !FAL_REQUEST_ID_RE.test(requestId)
  ) {
    return null;
  }
  return { modelId, requestId };
}

export function falModelToSubfolder(modelId: string): string {
  return modelId.replace(/\//g, '--');
}

export function falSubfolderToModel(subfolder: string): string | null {
  const modelId = subfolder.trim().replace(/--/g, '/');
  if (!FAL_MODEL_ID_RE.test(modelId) || !modelId.includes('/')) {
    return null;
  }
  return modelId;
}

export function mapFalQueueStatus(status: string | undefined): FalJobStatusName {
  const normalized = status?.trim().toUpperCase() ?? '';
  if (normalized === 'IN_QUEUE' || normalized === 'QUEUED') {
    return 'pending';
  }
  if (normalized === 'IN_PROGRESS' || normalized === 'PROCESSING') {
    return 'running';
  }
  if (normalized === 'COMPLETED' || normalized === 'OK') {
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

export function isAllowedFalMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'fal.media' ||
      host.endsWith('.fal.media') ||
      host === 'fal.ai' ||
      host.endsWith('.fal.ai')
    );
  } catch {
    return false;
  }
}
