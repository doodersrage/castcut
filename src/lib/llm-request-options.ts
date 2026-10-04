import { allowTemplateFallback, getLlmTemperature, isLlmEnabled } from './llm-env';
import type { LlmEndpointOverride } from './llm-client';
import {
  LLM_PUBLIC_PROVIDERS,
  normalizeSessionLlmProvider,
  type SessionLlmProvider,
} from './llm-providers';
import type { SharedToolSettings } from './settings-cache';

export type LlmRequestOptions = {
  temperature?: number;
  allowTemplateFallback?: boolean;
  /** Text model override for this request (falls back to server LLM_MODEL). */
  llmModel?: string;
  /** Vision model override for this request (falls back to server LLM_VISION_MODEL). */
  llmVisionModel?: string;
  /** false = template-only for this request/browser; undefined = server LLM_ENABLED default. */
  llmEnabled?: boolean;
  /** Session public provider (OpenRouter / Groq). Server env when unset. */
  llmProvider?: SessionLlmProvider;
  /** Session API key for a public provider. Never logged. */
  llmApiKey?: string;
};

/** The session LLM fields a request body may carry (sharedLlmRequestBody on the client). */
export type LlmRequestBody = {
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
  llmProvider?: string;
  llmApiKey?: string;
};

export function parseLlmRequestOptions(body?: LlmRequestBody | null): LlmRequestOptions {
  const temperature =
    typeof body?.llmTemperature === 'number' && body.llmTemperature >= 0 && body.llmTemperature <= 2
      ? body.llmTemperature
      : undefined;

  const allowFallback =
    typeof body?.allowTemplateFallback === 'boolean' ? body.allowTemplateFallback : undefined;

  const llmModel =
    typeof body?.llmModel === 'string' && body.llmModel.trim() ? body.llmModel.trim() : undefined;

  const llmVisionModel =
    typeof body?.llmVisionModel === 'string' && body.llmVisionModel.trim()
      ? body.llmVisionModel.trim()
      : undefined;

  const llmEnabled = typeof body?.llmEnabled === 'boolean' ? body.llmEnabled : undefined;
  const provider = normalizeSessionLlmProvider(body?.llmProvider);
  const llmApiKey =
    typeof body?.llmApiKey === 'string' && body.llmApiKey.trim()
      ? body.llmApiKey.trim().slice(0, 256)
      : undefined;

  return {
    temperature,
    allowTemplateFallback: allowFallback,
    llmModel,
    llmVisionModel,
    llmEnabled,
    ...(provider !== 'server' ? { llmProvider: provider } : {}),
    ...(provider !== 'server' && llmApiKey ? { llmApiKey } : {}),
  };
}

export function resolveRequestTemperature(options?: LlmRequestOptions): number {
  return getLlmTemperature(options?.temperature);
}

export function resolveRequestTemplateFallback(options?: LlmRequestOptions): boolean {
  if (typeof options?.allowTemplateFallback === 'boolean') {
    return options.allowTemplateFallback;
  }
  return allowTemplateFallback();
}

/**
 * Whether the LLM path should run for this request. An explicit `llmEnabled: false`
 * (session "template-only for this browser" toggle) short-circuits to template mode
 * regardless of the server LLM_ENABLED flag. A session OpenRouter/Groq provider is an
 * explicit opt-in and still runs when the local LLM is disabled.
 */
export function resolveRequestLlmEnabled(options?: LlmRequestOptions): boolean {
  if (options?.llmEnabled === false) {
    return false;
  }
  if (normalizeSessionLlmProvider(options?.llmProvider) !== 'server') {
    return true;
  }
  return isLlmEnabled();
}

export function resolveRequestLlmModel(options?: LlmRequestOptions): string | undefined {
  return options?.llmModel?.trim() || undefined;
}

export function resolveRequestVisionModel(options?: LlmRequestOptions): string | undefined {
  return options?.llmVisionModel?.trim() || undefined;
}

export function resolveRequestLlmEndpoint(
  options?: LlmRequestOptions
): LlmEndpointOverride | undefined {
  const provider = normalizeSessionLlmProvider(options?.llmProvider);
  if (provider === 'server') {
    return undefined;
  }
  const preset = LLM_PUBLIC_PROVIDERS[provider];
  const apiKey = options?.llmApiKey?.trim();
  return {
    baseUrl: preset.baseUrl,
    ...(apiKey ? { apiKey } : {}),
  };
}

export function llmRunnerOptions(llm?: LlmRequestOptions): {
  temperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
  llmProvider?: SessionLlmProvider;
  llmApiKey?: string;
} {
  if (!llm) {
    return {};
  }
  return {
    temperature: llm.temperature,
    allowTemplateFallback: llm.allowTemplateFallback,
    llmModel: llm.llmModel,
    llmVisionModel: llm.llmVisionModel,
    llmEnabled: llm.llmEnabled,
    llmProvider: llm.llmProvider,
    llmApiKey: llm.llmApiKey,
  };
}

export function sharedLlmRequestBody(
  shared: Pick<
    SharedToolSettings,
    | 'sessionLlmTemperature'
    | 'sessionAllowTemplateFallback'
    | 'sessionLlmModel'
    | 'sessionLlmVisionModel'
    | 'sessionLlmEnabled'
    | 'sessionLlmProvider'
    | 'sessionLlmApiKey'
  >
): {
  llmTemperature?: number;
  allowTemplateFallback?: boolean;
  llmModel?: string;
  llmVisionModel?: string;
  llmEnabled?: boolean;
  llmProvider?: SessionLlmProvider;
  llmApiKey?: string;
} {
  const provider = normalizeSessionLlmProvider(shared.sessionLlmProvider);
  return {
    ...(typeof shared.sessionLlmTemperature === 'number'
      ? { llmTemperature: shared.sessionLlmTemperature }
      : {}),
    ...(typeof shared.sessionAllowTemplateFallback === 'boolean'
      ? { allowTemplateFallback: shared.sessionAllowTemplateFallback }
      : {}),
    ...(shared.sessionLlmModel?.trim() ? { llmModel: shared.sessionLlmModel.trim() } : {}),
    ...(shared.sessionLlmVisionModel?.trim()
      ? { llmVisionModel: shared.sessionLlmVisionModel.trim() }
      : {}),
    ...(typeof shared.sessionLlmEnabled === 'boolean'
      ? { llmEnabled: shared.sessionLlmEnabled }
      : {}),
    ...(provider !== 'server' ? { llmProvider: provider } : {}),
    ...(provider !== 'server' && shared.sessionLlmApiKey?.trim()
      ? { llmApiKey: shared.sessionLlmApiKey.trim().slice(0, 256) }
      : {}),
  };
}

function formOptionalBool(value: FormDataEntryValue | null): boolean | undefined {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return undefined;
}

export function parseLlmRequestOptionsFromForm(formData: FormData): LlmRequestOptions {
  const tempRaw = String(formData.get('llmTemperature') ?? '').trim();
  const temperature = tempRaw ? Number(tempRaw) : NaN;
  return parseLlmRequestOptions({
    llmTemperature: Number.isFinite(temperature) ? temperature : undefined,
    allowTemplateFallback: formOptionalBool(formData.get('allowTemplateFallback')),
    llmModel: String(formData.get('llmModel') ?? ''),
    llmVisionModel: String(formData.get('llmVisionModel') ?? ''),
    llmEnabled: formOptionalBool(formData.get('llmEnabled')),
    llmProvider: String(formData.get('llmProvider') ?? ''),
    llmApiKey: String(formData.get('llmApiKey') ?? ''),
  });
}

export function appendSharedLlmFormData(
  form: FormData,
  shared: Parameters<typeof sharedLlmRequestBody>[0]
): void {
  const body = sharedLlmRequestBody(shared);
  if (typeof body.llmTemperature === 'number') {
    form.append('llmTemperature', String(body.llmTemperature));
  }
  if (typeof body.allowTemplateFallback === 'boolean') {
    form.append('allowTemplateFallback', String(body.allowTemplateFallback));
  }
  if (body.llmModel) {
    form.append('llmModel', body.llmModel);
  }
  if (body.llmVisionModel) {
    form.append('llmVisionModel', body.llmVisionModel);
  }
  if (typeof body.llmEnabled === 'boolean') {
    form.append('llmEnabled', String(body.llmEnabled));
  }
  if (body.llmProvider) {
    form.append('llmProvider', body.llmProvider);
  }
  if (body.llmApiKey) {
    form.append('llmApiKey', body.llmApiKey);
  }
}
