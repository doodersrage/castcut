import { detectVisionModel } from '@/lib/vision-model-auto';
import {
  checkCollabHealth,
  checkComfyUiPoolHealth,
  checkDiffusersHealth,
  checkLlmHealth,
  getExpandedComfyUiHealth,
} from '@/lib/service-health';
import { getLlmConfig, isLlmEnabled, allowTemplateFallback } from '@/lib/llm-client';
import { getComfyUiBaseUrl } from '@/lib/comfyui-client';
import { getComfyUiWorkflowSummary } from '@/lib/comfyui-status';
import { summarizeApiUsage } from '@/lib/api-usage-log';
import { isServerStorageEnabled, readServerStorage } from '@/lib/server-storage';
import { isEmailConfigured } from '@/lib/email/config';
import { stripEmptyComfyUiRuntime, type ComfyUiRuntimeConfig } from '@/lib/comfyui-config';
import { apiJson } from '@/lib/api/response';
import { getAuthBootstrapInfo } from '@/lib/auth/store';
import { getServerEnvSummary } from '@/lib/server-env-summary';

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

export async function GET(request: Request) {
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
    checkDiffusersHealth(diffusersUrlHint),
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
      visionModel: getLlmConfig().visionModel,
      llmApiKeyConfigured: Boolean(process.env.LLM_API_KEY?.trim()),
      visionModelConfigured: Boolean(process.env.LLM_VISION_MODEL?.trim()),
      // No LLM_VISION_MODEL: the vision model image checks will use, found in the model list.
      ...(visionModelDetected ? { visionModelDetected } : {}),
      comfyUiUrl,
    },
    serverEnv: getServerEnvSummary(),
  });
}
