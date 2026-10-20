export type CloudLlmJobStatusName = 'pending' | 'running' | 'completed' | 'error';

const MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,200}$/;
const JOB_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export function sanitizeCloudLlmModelId(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  if (!MODEL_ID_RE.test(trimmed)) {
    throw new Error(`Model id "${trimmed}" is not valid.`);
  }
  return trimmed.replace(/^\/+|\/+$/g, '');
}

export function newCloudLlmJobId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

export function encodeCloudLlmPromptId(modelId: string, jobId: string): string {
  return `${modelId}::${jobId}`;
}

export function parseCloudLlmPromptId(promptId: string): { modelId: string; jobId: string } | null {
  const trimmed = promptId.trim();
  const sep = trimmed.lastIndexOf('::');
  if (sep < 1 || sep === trimmed.length - 2) {
    return null;
  }
  const modelId = trimmed.slice(0, sep);
  const jobId = trimmed.slice(sep + 2);
  if (!MODEL_ID_RE.test(modelId) || !JOB_ID_RE.test(jobId)) {
    return null;
  }
  return { modelId, jobId };
}

export function cloudLlmModelToSubfolder(modelId: string): string {
  return modelId.replace(/[/:]+/g, '--');
}

export { aspectRatioFromSize } from '../media/aspect-ratio';

export function openaiSizeFromDimensions(width: number, height: number): string {
  const ratio = width / Math.max(1, height);
  if (Math.abs(ratio - 1) < 0.12) {
    return '1024x1024';
  }
  if (ratio > 1) {
    return '1536x1024';
  }
  return '1024x1536';
}

export function grokResolutionFromSize(width: number, height: number): '1k' | '2k' {
  return Math.max(width, height) >= 1536 ? '2k' : '1k';
}

export function providerErrorMessage(raw: Record<string, unknown>, fallback: string): string {
  const error = raw.error;
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }
  if (typeof raw.message === 'string' && raw.message.trim()) {
    return raw.message.trim();
  }
  if (typeof raw.detail === 'string' && raw.detail.trim()) {
    return raw.detail.trim();
  }
  return fallback;
}

export function extractBase64Image(raw: Record<string, unknown>): {
  bytes: Buffer;
  mimeType: string;
} | null {
  const fromDataArray = Array.isArray(raw.data) ? raw.data[0] : undefined;
  if (fromDataArray && typeof fromDataArray === 'object') {
    const item = fromDataArray as { b64_json?: unknown; b64Json?: unknown };
    const b64 =
      (typeof item.b64_json === 'string' && item.b64_json) ||
      (typeof item.b64Json === 'string' && item.b64Json) ||
      '';
    if (b64) {
      return { bytes: Buffer.from(b64, 'base64'), mimeType: 'image/png' };
    }
  }

  const candidates = (raw.candidates as unknown[]) ?? [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const content = (candidate as { content?: { parts?: unknown[] } }).content;
    const parts = content?.parts ?? [];
    for (const part of parts) {
      if (!part || typeof part !== 'object') {
        continue;
      }
      const record = part as {
        inlineData?: { data?: unknown; mimeType?: unknown };
        inline_data?: { data?: unknown; mime_type?: unknown };
      };
      const inline = record.inlineData ?? record.inline_data;
      const data = typeof inline?.data === 'string' ? inline.data : '';
      if (!data) {
        continue;
      }
      const mime =
        (typeof record.inlineData?.mimeType === 'string' && record.inlineData.mimeType) ||
        (typeof record.inline_data?.mime_type === 'string' && record.inline_data.mime_type) ||
        'image/png';
      return { bytes: Buffer.from(data, 'base64'), mimeType: mime };
    }
  }
  return null;
}

export function extractHttpsImageUrl(raw: Record<string, unknown>): string | null {
  const fromDataArray = Array.isArray(raw.data) ? raw.data[0] : undefined;
  if (fromDataArray && typeof fromDataArray === 'object') {
    const url = (fromDataArray as { url?: unknown }).url;
    if (typeof url === 'string' && url.startsWith('https://')) {
      return url;
    }
  }
  if (typeof raw.url === 'string' && raw.url.startsWith('https://')) {
    return raw.url;
  }
  return null;
}

export function isAllowedOpenaiMediaUrl(url: string): boolean {
  return isAllowedHost(url, [
    'oaidalleapiprodscus.blob.core.windows.net',
    'openai.com',
    'oaiusercontent.com',
  ]);
}

export function isAllowedGrokMediaUrl(url: string): boolean {
  return isAllowedHost(url, ['x.ai', 'imagine.x.ai']);
}

function isAllowedHost(url: string, hosts: string[]): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return hosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}
