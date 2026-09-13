import { getLlmConfig, isLlmEnabled } from './llm-client';
import {
  LLM_PUBLIC_PROVIDERS,
  catalogEntryIds,
  normalizeSessionLlmProvider,
  parseLlmCatalogEntries,
  type LlmCatalogEntry,
  type SessionLlmProvider,
} from './llm-providers';

export type LlmModelCatalogSource =
  'openai' | 'ollama' | 'anthropic' | 'openrouter' | 'groq' | 'none';

export type LlmModelCatalog = {
  ok: boolean;
  source: LlmModelCatalogSource;
  provider: SessionLlmProvider;
  models: string[];
  entries: LlmCatalogEntry[];
  error?: string;
  needsApiKey?: boolean;
};

const LIST_TIMEOUT_MS = 8_000;

export { parseLlmCatalogEntries, catalogEntryIds } from './llm-providers';

/** OpenAI-compatible `GET /v1/models` (`{ data: [{ id }] }`) and Anthropic's same shape. */
export function parseOpenAiCompatibleModels(payload: unknown): string[] {
  return catalogEntryIds(parseLlmCatalogEntries(payload));
}

/** Ollama `GET /api/tags` (`{ models: [{ name }] }`). */
export function parseOllamaTagModels(payload: unknown): string[] {
  return catalogEntryIds(parseLlmCatalogEntries(payload));
}

export function isOllamaLlmBaseUrl(baseUrl: string): boolean {
  return /ollama\.com/i.test(baseUrl) || /:11434(\/|$)/.test(baseUrl);
}

export function isAnthropicLlmBaseUrl(baseUrl: string): boolean {
  return /anthropic\.com/i.test(baseUrl);
}

function ollamaNativeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '');
}

function listHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (/openrouter\.ai/i.test(baseUrl)) {
    headers['HTTP-Referer'] = 'https://github.com';
    headers['X-Title'] = 'Castcut';
  }
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>;
}

async function listOpenAiCompatibleEntries(
  baseUrl: string,
  apiKey: string
): Promise<LlmCatalogEntry[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
    headers: listHeaders(baseUrl, apiKey),
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return parseLlmCatalogEntries(await readJson(response));
}

async function listAnthropicEntries(baseUrl: string, apiKey: string): Promise<LlmCatalogEntry[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return parseLlmCatalogEntries(await readJson(response));
}

async function listOllamaTagEntries(baseUrl: string, apiKey: string): Promise<LlmCatalogEntry[]> {
  const response = await fetch(`${ollamaNativeBaseUrl(baseUrl)}/api/tags`, {
    headers: listHeaders(baseUrl, apiKey),
    signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return parseLlmCatalogEntries(await readJson(response));
}

function catalogResult(
  source: LlmModelCatalogSource,
  provider: SessionLlmProvider,
  entries: LlmCatalogEntry[]
): LlmModelCatalog {
  return {
    ok: true,
    source,
    provider,
    entries,
    models: catalogEntryIds(entries),
  };
}

export type ListRemoteLlmModelsInput = {
  provider?: string;
  apiKey?: string;
};

function resolveListTarget(input?: ListRemoteLlmModelsInput): {
  provider: SessionLlmProvider;
  baseUrl: string;
  apiKey: string;
} {
  const env = getLlmConfig();
  const provider = normalizeSessionLlmProvider(input?.provider);
  const sessionKey = input?.apiKey?.trim() ?? '';
  if (provider !== 'server') {
    const preset = LLM_PUBLIC_PROVIDERS[provider];
    return {
      provider,
      baseUrl: preset.baseUrl,
      apiKey: sessionKey || env.apiKey,
    };
  }
  return { provider: 'server', baseUrl: env.baseUrl, apiKey: sessionKey || env.apiKey };
}

/** Ask the configured (or session) LLM provider for available models. */
export async function listRemoteLlmModels(
  input?: ListRemoteLlmModelsInput
): Promise<LlmModelCatalog> {
  const target = resolveListTarget(input);
  if (!isLlmEnabled() && target.provider === 'server') {
    return {
      ok: false,
      source: 'none',
      provider: 'server',
      models: [],
      entries: [],
      error: 'LLM_ENABLED=false',
    };
  }
  const errors: string[] = [];
  const publicSource: LlmModelCatalogSource =
    target.provider === 'openrouter'
      ? 'openrouter'
      : target.provider === 'groq'
        ? 'groq'
        : 'openai';

  if (target.provider !== 'server') {
    const preset = LLM_PUBLIC_PROVIDERS[target.provider];
    if (!preset.listWithoutKey && !target.apiKey) {
      return {
        ok: false,
        source: publicSource,
        provider: target.provider,
        models: [],
        entries: [],
        error: `Add a ${preset.label} API key to list models.`,
        needsApiKey: true,
      };
    }
    try {
      const entries = await listOpenAiCompatibleEntries(target.baseUrl, target.apiKey);
      if (entries.length > 0) {
        return catalogResult(publicSource, target.provider, entries);
      }
      errors.push(`${preset.label} returned an empty model list`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${preset.label} /models failed`);
    }
    return {
      ok: false,
      source: 'none',
      provider: target.provider,
      models: [],
      entries: [],
      error: errors[0] ?? 'No models listed by the LLM provider',
      needsApiKey: !target.apiKey,
    };
  }

  if (isAnthropicLlmBaseUrl(target.baseUrl)) {
    try {
      const entries = await listAnthropicEntries(target.baseUrl, target.apiKey);
      if (entries.length > 0) {
        return catalogResult('anthropic', 'server', entries);
      }
      errors.push('Anthropic returned an empty model list');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Anthropic /models failed');
    }
  } else {
    try {
      const entries = await listOpenAiCompatibleEntries(target.baseUrl, target.apiKey);
      if (entries.length > 0) {
        return catalogResult('openai', 'server', entries);
      }
      errors.push('Provider /models returned an empty list');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Provider /models failed');
    }
  }

  if (isOllamaLlmBaseUrl(target.baseUrl) || errors.length > 0) {
    try {
      const entries = await listOllamaTagEntries(target.baseUrl, target.apiKey);
      if (entries.length > 0) {
        return catalogResult('ollama', 'server', entries);
      }
      errors.push('Ollama /api/tags returned an empty list');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Ollama /api/tags failed');
    }
  }

  return {
    ok: false,
    source: 'none',
    provider: 'server',
    models: [],
    entries: [],
    error: errors[0] ?? 'No models listed by the LLM provider',
  };
}
