import { getComfyModelDefinition } from '../comfy-models/client';

/** Civitai `baseModels` query values we will send (exact strings the API expects). */
export const CIVITAI_BASE_MODELS = [
  'SD 1.5',
  'SDXL 1.0',
  'Pony',
  'Illustrious',
  'Flux.1 D',
  'Flux.1 S',
  'Flux.2',
  'SD 3',
  'SD 3.5',
  'Qwen',
  'Wan Video',
  'Hunyuan Video',
] as const;

export type CivitaiBaseModel = (typeof CIVITAI_BASE_MODELS)[number];

export type CivitaiLoraSearchHit = {
  modelId: number;
  versionId: number;
  name: string;
  versionName: string;
  baseModel: string;
  filename: string;
  bytes: number | null;
  creator?: string;
  previewUrl?: string;
};

const BLOCKED_LORA_PATTERN =
  /\b(loli|lolita|lolicon|shota|shotacon|underage|preteen|pedo(?:phil(?:ia|e))?|child.?porn|minor.?sex)\b/i;

export function isBlockedCivitaiLoraHaystack(haystack: string): boolean {
  return BLOCKED_LORA_PATTERN.test(haystack);
}

export function parseCivitaiVersionId(value: unknown): number | null {
  let raw: string | null = null;
  if (typeof value === 'number' && Number.isInteger(value)) {
    raw = String(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    raw = trimmed.toLowerCase().startsWith('civitai:') ? trimmed.slice('civitai:'.length) : trimmed;
  }
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1 || id > 1_000_000_000) {
    return null;
  }
  return id;
}

export function civitaiAssetId(versionId: number): string {
  return `civitai:${versionId}`;
}

export function civitaiLoraDownloadUrl(versionId: number): string {
  return `https://civitai.com/api/download/models/${versionId}`;
}

export function isCivitaiDownloadUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:') {
      return false;
    }
    const host = url.hostname.toLowerCase();
    if (host !== 'civitai.com' && !host.endsWith('.civitai.com')) {
      return false;
    }
    return /^\/api\/download\/models\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function sanitizeCivitaiBaseModel(value?: string | null): CivitaiBaseModel | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return CIVITAI_BASE_MODELS.find(entry => entry.toLowerCase() === trimmed.toLowerCase());
}

export function civitaiBaseModelForStudioModel(model?: string): CivitaiBaseModel | undefined {
  const id = model?.trim() ?? '';
  if (!id) {
    return undefined;
  }
  const def = getComfyModelDefinition(id);
  const known = def.id === id;

  if (/klein/i.test(id) || id === 'flux2' || /^flux-2/.test(id)) {
    return 'Flux.2';
  }
  if (id === 'flux-schnell') {
    return 'Flux.1 S';
  }
  if (known && def.category === 'flux') {
    return 'Flux.1 D';
  }
  if (known && def.category === 'qwen') {
    return 'Qwen';
  }
  if (id.startsWith('wan-') || (known && def.category === 'video' && /wan/i.test(id))) {
    return 'Wan Video';
  }
  if (id === 'hunyuan-video') {
    return 'Hunyuan Video';
  }
  if (known && def.category === 'sdxl') {
    return 'SDXL 1.0';
  }
  if (known && def.category === 'stable-diffusion') {
    return 'SD 1.5';
  }
  if (known && def.category === 'sd3') {
    return 'SD 3.5';
  }
  return undefined;
}

export function sanitizeLoraFilename(raw: string): string {
  const base = raw.replace(/\\/g, '/').split('/').pop()?.trim() ?? '';
  const cleaned = base
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/g, '')
    .slice(0, 180);
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error('Invalid LoRA filename.');
  }
  if (cleaned.includes('..')) {
    throw new Error('Invalid LoRA filename.');
  }
  if (/\.(safetensors|ckpt|pt|bin)$/i.test(cleaned)) {
    return cleaned;
  }
  return `${cleaned}.safetensors`;
}

export function buildCivitaiSearchUrl(input: {
  query: string;
  baseModel?: string;
  nsfw?: boolean;
  limit?: number;
}): string {
  const query = input.query.trim();
  if (query.length < 2) {
    throw new Error('Search query must be at least 2 characters.');
  }
  if (query.length > 120) {
    throw new Error('Search query is too long.');
  }
  const url = new URL('https://civitai.com/api/v1/models');
  url.searchParams.set('types', 'LORA');
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(Math.min(50, Math.max(1, input.limit ?? 20))));
  url.searchParams.set('sort', 'Highest Rated');
  url.searchParams.set('nsfw', input.nsfw ? 'true' : 'false');
  const baseModel = sanitizeCivitaiBaseModel(input.baseModel);
  if (baseModel) {
    url.searchParams.set('baseModels', baseModel);
  }
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickPrimaryFile(files: unknown): { name: string; sizeKB: number | null } | null {
  if (!Array.isArray(files)) {
    return null;
  }
  const models = files
    .map(asRecord)
    .filter((file): file is Record<string, unknown> => Boolean(file))
    .filter(file => {
      const type = asString(file.type).toLowerCase();
      return !type || type === 'model';
    });
  const named = models
    .map(file => ({
      name: asString(file.name).trim(),
      sizeKB: asNumber(file.sizeKB),
      format: asString(asRecord(file.metadata)?.format),
    }))
    .filter(file => file.name);
  const safetensor =
    named.find(file => /\.safetensors$/i.test(file.name) || /safetensor/i.test(file.format)) ??
    named[0];
  return safetensor ? { name: safetensor.name, sizeKB: safetensor.sizeKB } : null;
}

function pickPreviewUrl(images: unknown, includeNsfw: boolean): string | undefined {
  if (!Array.isArray(images)) {
    return undefined;
  }
  for (const image of images) {
    const row = asRecord(image);
    if (!row) {
      continue;
    }
    if (!includeNsfw && row.nsfw === true) {
      continue;
    }
    const url = asString(row.url).trim();
    if (!url.startsWith('https://')) {
      continue;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        continue;
      }
      return url;
    } catch {
      continue;
    }
  }
  return undefined;
}

export function mapCivitaiSearchItems(
  payload: unknown,
  options?: { includeNsfw?: boolean }
): CivitaiLoraSearchHit[] {
  const includeNsfw = Boolean(options?.includeNsfw);
  const root = asRecord(payload);
  const items = root && Array.isArray(root.items) ? root.items : [];
  const hits: CivitaiLoraSearchHit[] = [];

  for (const item of items) {
    const model = asRecord(item);
    if (!model) {
      continue;
    }
    if (!includeNsfw && model.nsfw === true) {
      continue;
    }
    const tags = Array.isArray(model.tags)
      ? model.tags.map(tag => asString(tag)).filter(Boolean)
      : [];
    const versions = Array.isArray(model.modelVersions) ? model.modelVersions : [];
    for (const versionValue of versions) {
      const version = asRecord(versionValue);
      if (!version) {
        continue;
      }
      const versionId = parseCivitaiVersionId(version.id);
      const modelId = parseCivitaiVersionId(model.id);
      if (versionId == null || modelId == null) {
        continue;
      }
      const file = pickPrimaryFile(version.files);
      if (!file) {
        continue;
      }
      let filename: string;
      try {
        filename = sanitizeLoraFilename(file.name);
      } catch {
        continue;
      }
      const name = asString(model.name).trim() || filename;
      const versionName = asString(version.name).trim() || 'version';
      const haystack = [name, versionName, filename, tags.join(' '), asString(model.description)]
        .join(' ')
        .slice(0, 4000);
      if (isBlockedCivitaiLoraHaystack(haystack)) {
        continue;
      }
      const bytes = file.sizeKB != null && file.sizeKB > 0 ? Math.round(file.sizeKB * 1024) : null;
      hits.push({
        modelId,
        versionId,
        name,
        versionName,
        baseModel: asString(version.baseModel).trim() || 'Other',
        filename,
        bytes,
        creator: asString(asRecord(model.creator)?.username).trim() || undefined,
        previewUrl: pickPreviewUrl(version.images, includeNsfw),
      });
      break;
    }
  }

  return hits;
}
