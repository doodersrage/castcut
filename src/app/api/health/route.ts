import { isAuthEnabled } from '@/lib/auth/store';
import { resolveRequestUser } from '@/lib/auth/access';
import { timingSafeEqual } from 'node:crypto';
import { detectVisionModel } from '@/lib/vision/model-auto';
import {
  checkCollabHealth,
  checkComfyUiPoolHealth,
  checkDiffusersHealth,
  checkLlmHealth,
  getExpandedComfyUiHealth,
} from '@/lib/server/service-health';
import { getLlmConfig, isLlmEnabled, allowTemplateFallback } from '@/lib/llm/client';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { getComfyUiWorkflowSummary } from '@/lib/comfyui/status';
import { summarizeApiUsage } from '@/lib/server/api-usage-log';
import { isServerStorageEnabled, readServerStorage } from '@/lib/storage/server-storage';
import { isEmailConfigured } from '@/lib/email/config';
import { stripEmptyComfyUiRuntime, type ComfyUiRuntimeConfig } from '@/lib/comfyui/config';
import { diffusersEngineAvailability } from '@/lib/engine/diffusers-engine-install';
import { apiJson } from '@/lib/api/response';
import { getAuthBootstrapInfo } from '@/lib/auth/store';
import { getServerEnvSummary } from '@/lib/server/server-env-summary';

export const runtime = 'nodejs';

function loadPersistedComfyPoolUrls(): string[] {
  if (!isServerStorageEnabled()) {
    return [];
  }
  const cache = readServerStorage<{ shared?: { comfyPoolUrls?: string[] } }>('settings-cache');
  return Array.isArray(cache?.shared?.comfyPoolUrls) ? cache.shared.comfyPoolUrls : [];
}

function parseRuntimeFromSearch(searchParams: URLSearchParams): ComfyUiRuntimeConfig | undefined {
  return stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
    positiveToken: searchParams.get('positiveToken') ?? undefined,
    negativeToken: searchParams.get('negativeToken') ?? undefined,
  });
}

/**
 * Signed out, with login on: only whether things are up. The full answer listed internal service
 * addresses, model names, GPU and memory, versions, data folder paths and the env summary to
 * anyone who could reach the login page (security audit, 2026-10-11).
 */
function isAnonymousRequest(request: Request): boolean {
  if (!isAuthEnabled()) return false;
  if (resolveRequestUser(request)) return false;
  const expected = process.env.PROMPT_API_TOKEN?.trim();
  const authorization = request.headers.get('authorization');
  const provided =
    (authorization?.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '') ||
    request.headers.get('x-prompt-api-token')?.trim() ||
    '';
  if (!expected || !provided) return true;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return !(a.length === b.length && timingSafeEqual(a, b));
}

export async function GET(request: Request) {
  if (isAnonymousRequest(request)) {
    const comfy = await getExpandedComfyUiHealth(undefined).catch(() => null);
    return apiJson({
      comfyui: { ok: Boolean((comfy as { ok?: boolean } | null)?.ok) },
      auth: { enabled: true },
    });
  }
  const searchParams = new URL(request.url).searchParams;
  // Cached for minutes after the first look; capped so health never waits long on it.
  const visionModelDetected =
    isLlmEnabled() && !process.env.LLM_VISION_MODEL?.trim()
      ? await Promise.race([
          detectVisionModel(),
          new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 1_500)),
        ])
      : undefined;
  const runtime = parseRuntimeFromSearch(searchParams);

  let comfyUiUrl = '';
  try {
    comfyUiUrl = getComfyUiBaseUrl(runtime);
  } catch {
    comfyUiUrl = '';
  }

  const diffusersUrlHint = searchParams.get('diffusersUrl')?.trim() || undefined;

  const [llm, comfyui, workflow, comfyuiPool, diffusers, collab] = await Promise.all([
    checkLlmHealth(),
    getExpandedComfyUiHealth(runtime),
    (async () => {
      try {
        return await getComfyUiWorkflowSummary(runtime);
      } catch (error) {
        return {
          apiUrl: comfyUiUrl,
          workflowSource: 'none' as const,
          error: error instanceof Error ? error.message : 'Invalid ComfyUI config',
        };
      }
    })(),
    checkComfyUiPoolHealth(loadPersistedComfyPoolUrls()),
    // Not installed and no engine URL: nothing to probe (the engine is an optional add-on).
    diffusersUrlHint || diffusersEngineAvailability().available
      ? checkDiffusersHealth(diffusersUrlHint)
      : Promise.resolve(undefined),
    checkCollabHealth(),
  ]);

  return apiJson({
    llm,
    comfyui,
    comfyuiPool,
    diffusers,
    collab,
    workflow,
    apiUsage: summarizeApiUsage(),
    storage: {
      enabled: isServerStorageEnabled(),
      engine: isServerStorageEnabled() ? 'sqlite' : 'none',
    },
    email: { configured: isEmailConfigured() },
    auth: getAuthBootstrapInfo(),
    config: {
      llmEnabled: isLlmEnabled(),
      allowTemplateFallback: allowTemplateFallback(),
      llmModel: getLlmConfig().model,
      // What image checks will really use: LLM_VISION_MODEL, else one found in the list — not
      // the text model's name (it showed "dolphin-llama3" for vision on a fresh install).
      visionModel: process.env.LLM_VISION_MODEL?.trim() || visionModelDetected || '',
      llmApiKeyConfigured: Boolean(process.env.LLM_API_KEY?.trim()),
      visionModelConfigured: Boolean(process.env.LLM_VISION_MODEL?.trim()),
      // No LLM_VISION_MODEL: the vision model image checks will use, found in the model list.
      ...(visionModelDetected ? { visionModelDetected } : {}),
      comfyUiUrl,
    },
    serverEnv: getServerEnvSummary(),
  });
}
