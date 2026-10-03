'use client';

/**
 * Browser half of engine health (see engine-health.ts): build each engine's graph the way a
 * queue would — the same `/api/comfyui/preview` build the workflow health panel's queue test
 * reads — and check it against the cached `/object_info`. Results are kept per ComfyUI URL for
 * as long as the object_info cache, and an event tells the Engine chips to re-read them.
 */

import type { ComfyImageModel } from './comfy-models/client';
import { getComfyModelDefinition } from './comfy-models/client';
import { fetchComfyObjectInfoCached } from './comfyui-object-info-cache';
import { resolveRuntimeForQueueAsync } from './comfyui-runtime-for-model';
import { fetchWorkflowPreview } from './comfyui-requeue';
import { isEditCapableModel } from './model-denoise-defaults';
import { resolveQueueParams } from './queue-params-settings';
import {
  ENGINE_HEALTH_ENGINES,
  collectEngineRequirements,
  engineForModel,
  engineHealthFromRequirements,
  type EngineHealth,
} from './engine-health';
import {
  currentEngineHealthUrl,
  readEngineHealth,
  storeEngineHealth as store,
} from './engine-health-store';

const SAMPLE_PROMPT = 'A woman standing in a sunlit park, natural light, photo.';

const inFlight = new Map<string, Promise<EngineHealth>>();

async function runCheck(model: string, comfyUrl: string, force: boolean): Promise<EngineHealth> {
  const engine = engineForModel(model);
  const base = { model, comfyUrl, checkedAt: Date.now() };
  const objectInfo = await fetchComfyObjectInfoCached({
    comfyUrl: comfyUrl || undefined,
    forceRefresh: force,
  }).catch(() => null);
  if (!objectInfo) {
    return {
      ...base,
      ...engineHealthFromRequirements({
        requirements: { nodeTypes: [], models: [] },
        knownNodeTypes: null,
        models: null,
      }),
    };
  }
  const video = getComfyModelDefinition(model).category === 'video';
  const hasInputImage = video || isEditCapableModel(model);
  try {
    const runtime = await resolveRuntimeForQueueAsync(
      model as ComfyImageModel,
      video ? undefined : 'day',
      // The cached inventory: no system-workflow rescan (it saves settings) on a health check.
      { inventory: objectInfo.models, comfyUrl: comfyUrl || undefined }
    );
    const preview = await fetchWorkflowPreview({
      prompt: SAMPLE_PROMPT,
      model,
      params: resolveQueueParams({
        model,
        tool: video ? undefined : 'day',
        inputImageFilename: hasInputImage ? 'preview-input.png' : undefined,
      }),
      hasInputImage,
      comfy: comfyUrl ? { ...runtime, apiUrl: comfyUrl } : runtime,
      fullWorkflow: true,
    });
    const workflow = preview.workflowJson
      ? (JSON.parse(preview.workflowJson) as Record<string, unknown>)
      : null;
    if (!preview.ok || !workflow) {
      throw new Error(preview.error ?? 'The engine graph could not be built.');
    }
    return {
      ...base,
      ...engineHealthFromRequirements({
        requirements: collectEngineRequirements(workflow, engine?.extraNodeTypes),
        knownNodeTypes: objectInfo.nodeTypes,
        models: objectInfo.models,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The engine graph could not be built.';
    return {
      ...base,
      state: 'unknown',
      missingNodes: [],
      missingModels: [],
      nodePacks: [],
      summary: 'Not checked — the graph could not be built',
      error: message,
    };
  }
}

/** Check one engine (cached; concurrent callers share one check). */
export function checkEngineHealth(
  model: string,
  options?: {
    /** Skip the cached result. */
    force?: boolean;
    /** Also re-read `/object_info` (defaults to `force`). */
    refreshObjectInfo?: boolean;
    comfyUrl?: string;
  }
): Promise<EngineHealth> {
  const comfyUrl = options?.comfyUrl ?? currentEngineHealthUrl();
  if (!options?.force) {
    const cached = readEngineHealth(model, comfyUrl);
    if (cached) return Promise.resolve(cached);
  }
  const key = `${comfyUrl}::${model}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = runCheck(model, comfyUrl, options?.refreshObjectInfo ?? options?.force === true)
    .then(store)
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

/**
 * Check every pickable engine, one after another (a handful of preview builds, never a
 * render). `force` re-reads `/object_info` once, for the first engine.
 */
export async function checkAllEngineHealth(options?: {
  force?: boolean;
  comfyUrl?: string;
}): Promise<EngineHealth[]> {
  const out: EngineHealth[] = [];
  const force = options?.force === true;
  let refreshObjectInfo = force;
  for (const engine of ENGINE_HEALTH_ENGINES) {
    out.push(
      await checkEngineHealth(engine.model, {
        force,
        refreshObjectInfo,
        comfyUrl: options?.comfyUrl,
      })
    );
    refreshObjectInfo = false;
  }
  return out;
}
