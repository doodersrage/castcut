import type { ServerEnvSummary } from '@/lib/server-env-summary';
import type { ComfyUiSettingsSectionId } from '@/lib/settings-comfyui-nav';

export const SETTINGS_TOOL_ACCENT = 'neutral' as const;

export const COMFYUI_SECTION_ELEMENT_IDS: Record<ComfyUiSettingsSectionId, string> = {
  presets: 'settings-comfyui-presets',
  'workflow-map': 'settings-comfyui-workflow-map',
  'model-assets': 'settings-comfyui-model-assets',
  'workflow-patching': 'settings-comfyui-workflow-patching',
  'lora-library': 'settings-comfyui-lora-library',
  'lora-train': 'settings-comfyui-lora-train',
  'workflow-library': 'settings-comfyui-workflow-library',
  'inference-engine': 'settings-comfyui-inference-engine',
  connection: 'settings-comfyui-connection',
  'auto-improve': 'settings-comfyui-auto-improve',
  'queue-params': 'settings-comfyui-queue-params',
  'prompt-quality': 'settings-comfyui-prompt-quality',
  'vram-guard': 'settings-comfyui-vram-guard',
  'hold-max': 'settings-comfyui-hold-max',
  'sampler-memory': 'settings-comfyui-sampler-memory',
};

export const PLAYBOOK_SECTION_CHECKLISTS: Partial<Record<ComfyUiSettingsSectionId, string>> = {
  'workflow-map':
    'Checklist: install the missing custom node pack in ComfyUI → refresh object_info → remap the model workflow.',
  'model-assets':
    'Checklist: confirm checkpoint/VAE/upscale filenames match ComfyUI input folders → save loader maps.',
  'lora-library':
    'Checklist: enable the LoRA in the session stack → verify filename on disk → re-queue.',
  connection:
    'Checklist: verify ComfyUI URL/port → Test connection → Heal & ready (system workflows + maps) → Open Generate.',
  'inference-engine':
    'Checklist: pick ComfyUI, Diffusers, or a cloud engine → add the matching API key (or rely on server env) → Open Generate.',
  'vram-guard': 'Checklist: lower queue quality / enable OOM downgrade → free VRAM → re-queue.',
};

export function serverEnvFieldValue(
  serverEnv: ServerEnvSummary | undefined,
  key: string
): string | undefined {
  for (const group of serverEnv?.groups ?? []) {
    const field = group.fields.find(entry => entry.key === key);
    if (field?.value) {
      return field.value;
    }
  }
  return undefined;
}

export function formatModelWorkflowMap(map?: Record<string, string>): string {
  if (!map) {
    return '';
  }
  return Object.entries(map)
    .map(([modelId, workflowFileId]) => `${modelId}=${workflowFileId}`)
    .join('\n');
}

export function parseModelWorkflowMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const modelId = trimmed.slice(0, separator).trim();
    const workflowFileId = trimmed.slice(separator + 1).trim();
    if (modelId && workflowFileId) {
      map[modelId] = workflowFileId;
    }
  }
  return map;
}

export type HealthResponse = {
  llm: {
    ok: boolean;
    enabled: boolean;
    model?: string;
    visionModel?: string;
    baseUrl?: string;
    error?: string;
    inFlight?: number;
    maxInflight?: number;
    busy?: boolean;
  };
  comfyui: {
    ok: boolean;
    url: string;
    error?: string;
    queuePending?: number;
    queueRunning?: number;
    vram?: { free?: number; total?: number };
    ram?: { free?: number; total?: number };
    version?: string;
    deviceName?: string;
    features?: string[];
    previewMetadata?: boolean;
    extensionPacks?: number;
    embeddingCount?: number;
  };
  diffusers?: {
    ok: boolean;
    url: string;
    device?: string;
    model?: string;
    mock?: boolean;
    error?: string;
  };
  apiUsage?: {
    total: number;
    lastHour: number;
    rateLimited: number;
    avgDurationMs: number;
  };
  storage?: { enabled: boolean };
  email?: { configured: boolean };
  auth?: { enabled: boolean; defaultAdminUsername?: string };
  workflow?: {
    apiUrl: string;
    workflowSource: 'client' | 'env' | 'none';
    placeholderTokens: { positive: string; negative: string };
    placeholders: { positive: number; negative: number };
    legacyNodeFallback: boolean;
    hasWorkflow: boolean;
  };
  config: {
    llmEnabled: boolean;
    allowTemplateFallback: boolean;
    llmModel: string;
    visionModel: string;
    llmApiKeyConfigured?: boolean;
    visionModelConfigured?: boolean;
    comfyUiUrl: string;
  };
  serverEnv?: ServerEnvSummary;
  comfyuiPool?: {
    enabled: boolean;
    endpoints: Array<{
      index: number;
      ok: boolean;
      url: string;
      error?: string;
      queuePending?: number;
      queueRunning?: number;
      vram?: { free?: number; total?: number };
      ram?: { free?: number; total?: number };
      version?: string;
      deviceName?: string;
      features?: string[];
      previewMetadata?: boolean;
      extensionPacks?: number;
      embeddingCount?: number;
    }>;
  };
  collab?: {
    redisConfigured: boolean;
    redisConnected: boolean;
    filePersistence: boolean;
    backend: 'redis' | 'sqlite' | 'file' | 'memory';
  };
};

/**
 * True when `/api/health` returned a real health payload. Error bodies (a 429 from the API rate
 * limiter, a 5xx `{ error }`) lack the service objects, and storing one as health crashed every
 * panel that reads `health.comfyui.ok`.
 */
export function isHealthResponse(value: unknown): value is HealthResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  const service = (key: string) => {
    const entry = record[key];
    return Boolean(entry) && typeof entry === 'object' && 'ok' in (entry as object);
  };
  return service('comfyui') && service('llm');
}
