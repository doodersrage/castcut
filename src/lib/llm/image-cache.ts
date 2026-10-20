import 'server-only';

type BinaryRecord = {
  bytes: Buffer;
  mimeType: string;
  createdAt: number;
};

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_CACHED_UPLOADS = 24;
const MAX_CACHED_OUTPUTS = 48;
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const OUTPUT_TTL_MS = 6 * 60 * 60 * 1000;

const uploads = new Map<string, BinaryRecord>();
const outputs = new Map<string, BinaryRecord>();

function pruneMap(map: Map<string, BinaryRecord>, ttlMs: number, maxSize: number): void {
  const now = Date.now();
  for (const [key, value] of map) {
    if (now - value.createdAt > ttlMs) {
      map.delete(key);
    }
  }
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (typeof oldest !== 'string') {
      break;
    }
    map.delete(oldest);
  }
}

export function storeLlmImageUpload(input: {
  engineId: string;
  bytes: Buffer;
  mimeType?: string;
}): { name: string; subfolder: string; type: string } {
  if (input.bytes.length === 0) {
    throw new Error('Image file is empty.');
  }
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    throw new Error('Image must be 12MB or smaller.');
  }
  pruneMap(uploads, UPLOAD_TTL_MS, MAX_CACHED_UPLOADS);
  const ext =
    input.mimeType === 'image/jpeg' || input.mimeType === 'image/jpg'
      ? 'jpg'
      : input.mimeType === 'image/webp'
        ? 'webp'
        : 'png';
  const name = `${input.engineId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  uploads.set(name, {
    bytes: input.bytes,
    mimeType: input.mimeType?.startsWith('image/') ? input.mimeType : `image/${ext}`,
    createdAt: Date.now(),
  });
  return { name, subfolder: '', type: 'input' };
}

export function getLlmImageUpload(name: string): BinaryRecord {
  const record = uploads.get(name);
  if (!record) {
    throw new Error('Reference image expired. Upload it again, then queue.');
  }
  return record;
}

function outputCacheKey(engineId: string, subfolder: string, filename: string): string {
  return `${engineId}|${subfolder}|${filename}`;
}

export function putLlmImageOutput(input: {
  engineId: string;
  subfolder: string;
  filename: string;
  bytes: Buffer;
  mimeType: string;
}): void {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  outputs.set(outputCacheKey(input.engineId, input.subfolder, input.filename), {
    bytes: input.bytes,
    mimeType: input.mimeType,
    createdAt: Date.now(),
  });
}

export function getLlmImageOutput(
  engineId: string,
  subfolder: string,
  filename: string
): BinaryRecord | null {
  pruneMap(outputs, OUTPUT_TTL_MS, MAX_CACHED_OUTPUTS);
  return outputs.get(outputCacheKey(engineId, subfolder, filename)) ?? null;
}
