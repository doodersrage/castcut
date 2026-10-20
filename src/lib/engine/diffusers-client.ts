import {
  getComfyUiAllowedHosts,
  isComfyClientUrlAllowed,
  normalizeSafeHttpUrl,
} from '../server/url-safety';

export const DEFAULT_DIFFUSERS_API_URL = 'http://127.0.0.1:8190';

function envDiffusersBaseUrl(): string {
  return (
    process.env.DIFFUSERS_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_DIFFUSERS_API_URL?.trim() ||
    DEFAULT_DIFFUSERS_API_URL
  );
}

/** Resolve Diffusers engine base URL (allowlisted, private hosts OK). */
export function getDiffusersBaseUrl(clientUrl?: string): string {
  const allowedHosts = getComfyUiAllowedHosts();
  const trimmed = clientUrl?.trim();

  if (trimmed && isComfyClientUrlAllowed()) {
    return normalizeSafeHttpUrl(trimmed, {
      allowPrivate: true,
      allowedHosts,
    });
  }

  return normalizeSafeHttpUrl(envDiffusersBaseUrl(), {
    allowPrivate: true,
    allowedHosts,
  });
}

export type DiffusersTxt2ImgBody = {
  prompt: string;
  negative_prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance_scale?: number;
  seed?: number | null;
  client_id?: string;
  /** null = auto-detect workshop roles; true/false force crop on/off. */
  workshop_crop?: boolean | null;
  /** Studio model id for post scale rules (Lightning / chroma guard). */
  studio_model?: string;
  quality_profile?: string;
  /** Final/Max Lanczos (or soft) scale; 1 / omit = none. */
  output_upscale_scale?: number;
  output_upscale_method?: 'lanczos' | 'area' | 'bilinear' | 'bicubic';
  output_moire_blur_sigma?: number;
  output_moire_downscale?: number;
};

export type DiffusersQueueResult = {
  ok: boolean;
  promptId?: string;
  engineUrl?: string;
  error?: string;
  status: number;
  raw: Record<string, unknown>;
};

export async function queueDiffusersTxt2Img(
  body: DiffusersTxt2ImgBody,
  engineUrlHint?: string
): Promise<DiffusersQueueResult> {
  let engineUrl: string;
  try {
    engineUrl = getDiffusersBaseUrl(engineUrlHint);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid Diffusers URL.',
      raw: {},
    };
  }

  try {
    const response = await fetch(`${engineUrl}/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const detail =
        typeof raw.detail === 'string'
          ? raw.detail
          : typeof raw.error === 'string'
            ? raw.error
            : `Diffusers queue returned HTTP ${response.status}`;
      return { ok: false, status: response.status, error: detail, raw, engineUrl };
    }
    const promptId = typeof raw.prompt_id === 'string' ? raw.prompt_id.trim() : undefined;
    const returnedUrl = typeof raw.engine_url === 'string' ? raw.engine_url.trim() : engineUrl;
    if (!promptId) {
      return {
        ok: false,
        status: 502,
        error: 'Diffusers did not return prompt_id.',
        raw,
        engineUrl,
      };
    }
    return {
      ok: true,
      status: response.status,
      promptId,
      engineUrl: returnedUrl || engineUrl,
      raw,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Diffusers queue request failed.',
      raw: {},
      engineUrl,
    };
  }
}

export type DiffusersJobStatus = {
  promptId: string;
  status: string;
  statusMessage?: string;
  engineUrl: string;
  images?: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
  progressValue?: number;
  progressMax?: number;
};

export type DiffusersListedModel = {
  id: string;
  label: string;
  kind: 'single_file' | 'diffusers_dir';
  family: string;
  default: boolean;
  bucket?: string;
};

export type DiffusersModelsResult = {
  models: DiffusersListedModel[];
  checkpoints: DiffusersListedModel[];
  diffusionModels: DiffusersListedModel[];
  textEncoders: DiffusersListedModel[];
  vaes: DiffusersListedModel[];
  loras: DiffusersListedModel[];
  defaultModel: string | null;
  searchPaths: string[];
  engineUrl: string;
};

function mapListedModels(raw: unknown): DiffusersListedModel[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return (raw as Array<Record<string, unknown>>)
    .filter(item => typeof item.id === 'string' && item.id.trim())
    .map(item => ({
      id: String(item.id).trim(),
      label:
        typeof item.label === 'string' && item.label.trim()
          ? item.label.trim()
          : String(item.id).trim(),
      kind: item.kind === 'diffusers_dir' ? ('diffusers_dir' as const) : ('single_file' as const),
      family: typeof item.family === 'string' && item.family.trim() ? item.family.trim() : 'other',
      default: Boolean(item.default),
      bucket:
        typeof item.bucket === 'string' && item.bucket.trim() ? item.bucket.trim() : undefined,
    }));
}

export async function fetchDiffusersModels(
  engineUrlHint?: string
): Promise<DiffusersModelsResult | null> {
  let engineUrl: string;
  try {
    engineUrl = getDiffusersBaseUrl(engineUrlHint);
  } catch {
    return null;
  }

  try {
    const response = await fetch(`${engineUrl}/v1/models`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const models = mapListedModels(raw.models);
    const checkpoints = mapListedModels(raw.checkpoints);
    return {
      models: models.length > 0 ? models : checkpoints,
      checkpoints: checkpoints.length > 0 ? checkpoints : models,
      diffusionModels: mapListedModels(raw.diffusion_models),
      textEncoders: mapListedModels(raw.text_encoders),
      vaes: mapListedModels(raw.vaes),
      loras: mapListedModels(raw.loras),
      defaultModel: typeof raw.default_model === 'string' ? raw.default_model.trim() : null,
      searchPaths: Array.isArray(raw.search_paths)
        ? raw.search_paths.filter((path): path is string => typeof path === 'string')
        : [],
      engineUrl,
    };
  } catch {
    return null;
  }
}

export type DiffusersClassifyResult = {
  supported: boolean;
  family: string;
  reason: string;
  unsupportedNodes: string[];
  assets: Record<string, unknown>;
  engineUrl: string;
};

export async function classifyDiffusersWorkflow(
  prompt: Record<string, unknown>,
  engineUrlHint?: string
): Promise<DiffusersClassifyResult | null> {
  let engineUrl: string;
  try {
    engineUrl = getDiffusersBaseUrl(engineUrlHint);
  } catch {
    return null;
  }

  try {
    const response = await fetch(`${engineUrl}/v1/workflow/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return null;
    }
    return {
      supported: Boolean(raw.supported),
      family: typeof raw.family === 'string' ? raw.family : 'unsupported',
      reason: typeof raw.reason === 'string' ? raw.reason : '',
      unsupportedNodes: Array.isArray(raw.unsupported_nodes)
        ? raw.unsupported_nodes.filter((entry): entry is string => typeof entry === 'string')
        : [],
      assets:
        raw.assets && typeof raw.assets === 'object' ? (raw.assets as Record<string, unknown>) : {},
      engineUrl,
    };
  } catch {
    return null;
  }
}

export async function queueDiffusersWorkflow(
  body: { prompt: Record<string, unknown>; client_id?: string },
  engineUrlHint?: string
): Promise<DiffusersQueueResult & { family?: string }> {
  let engineUrl: string;
  try {
    engineUrl = getDiffusersBaseUrl(engineUrlHint);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : 'Invalid Diffusers URL.',
      raw: {},
    };
  }

  try {
    const response = await fetch(`${engineUrl}/v1/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const detail =
        typeof raw.detail === 'string'
          ? raw.detail
          : raw.detail &&
              typeof raw.detail === 'object' &&
              typeof (raw.detail as { message?: unknown }).message === 'string'
            ? String((raw.detail as { message: string }).message)
            : typeof raw.error === 'string'
              ? raw.error
              : `Diffusers workflow returned HTTP ${response.status}`;
      return { ok: false, status: response.status, error: detail, raw, engineUrl };
    }
    const promptId = typeof raw.prompt_id === 'string' ? raw.prompt_id.trim() : undefined;
    const returnedUrl = typeof raw.engine_url === 'string' ? raw.engine_url.trim() : engineUrl;
    if (!promptId) {
      return {
        ok: false,
        status: 502,
        error: 'Diffusers did not return prompt_id.',
        raw,
        engineUrl,
      };
    }
    return {
      ok: true,
      status: response.status,
      promptId,
      engineUrl: returnedUrl || engineUrl,
      family: typeof raw.family === 'string' ? raw.family : undefined,
      raw,
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : 'Diffusers workflow request failed.',
      raw: {},
      engineUrl,
    };
  }
}

export async function fetchDiffusersJobStatus(
  promptId: string,
  engineUrlHint?: string
): Promise<DiffusersJobStatus | null> {
  let engineUrl: string;
  try {
    engineUrl = getDiffusersBaseUrl(engineUrlHint);
  } catch {
    return null;
  }

  try {
    const response = await fetch(`${engineUrl}/v1/jobs/${encodeURIComponent(promptId)}`, {
      signal: AbortSignal.timeout(30_000),
    });
    // Engine restarts wipe in-memory jobs — stop gallery polls instead of looping forever.
    if (response.status === 404) {
      return {
        promptId,
        status: 'error',
        statusMessage: 'Diffusers job not found (engine restarted or id lost).',
        engineUrl,
      };
    }
    if (!response.ok) {
      return null;
    }
    const raw = (await response.json()) as Record<string, unknown>;
    const progress =
      raw.progress && typeof raw.progress === 'object'
        ? (raw.progress as { value?: unknown; max?: unknown })
        : undefined;
    const images = Array.isArray(raw.images)
      ? (raw.images as Array<Record<string, unknown>>)
          .filter(img => typeof img.filename === 'string')
          .map(img => ({
            filename: String(img.filename),
            subfolder: typeof img.subfolder === 'string' ? img.subfolder : '',
            type: typeof img.type === 'string' ? img.type : 'output',
          }))
      : undefined;

    return {
      promptId,
      status: typeof raw.status === 'string' ? raw.status : 'unknown',
      statusMessage: typeof raw.status_message === 'string' ? raw.status_message : undefined,
      engineUrl,
      images,
      progressValue: typeof progress?.value === 'number' ? progress.value : undefined,
      progressMax: typeof progress?.max === 'number' ? progress.max : undefined,
    };
  } catch {
    return null;
  }
}
