/**
 * Client-side first-run / Heal & ready helpers.
 * Enables system workflows and adapts loader maps from Comfy inventory when reachable.
 */

import {
  formatModelCheckpointMap,
  formatModelRefinerMap,
  formatModelVaeMap,
  mergeSuggestedLoaderMaps,
} from '../model/checkpoint-map';
import { formatModelUpscaleMap } from '../model/upscale-map';
import { formatModelControlNetMap } from '../model/controlnet-map';
import { loadSettingsCache, saveSettingsCache, setUseSystemWorkflowsPref } from '../settings/cache';
import { whenBrowserStorageReady, flushBrowserStorageNow } from '../storage/browser-storage';
import { loadComfyUiSettings } from '../comfyui/settings';
import { fetchComfyObjectInfoCached } from '../comfyui/object-info-cache';
import { syncLoaderMapsFromInventory } from '../workflow/loader-map-inventory-sync';
import {
  markOnboardingComfyHealthOk,
  markOnboardingLlmHealthOk,
  markOnboardingSystemWorkflowsEnabled,
} from './onboarding-hooks';

export type HealProgress = {
  phase: 'health' | 'maps' | 'host' | 'done';
  message: string;
  host?: string;
  hostIndex?: number;
  hostCount?: number;
};

export type FirstRunSetupResult = {
  ok: boolean;
  message: string;
  comfyOk: boolean;
  systemWorkflowsEnabled: boolean;
  mapsAdapted: boolean;
  llmOk?: boolean;
  nodesInstalled?: string[];
  nodesUnresolved?: string[];
  restartRequested?: boolean;
  hostsHealed?: number;
};

/** Turn on system workflows and adapt maps (suggested + live inventory when available). */
export async function enableSystemWorkflowsAndHeal(options?: {
  comfyUrl?: string;
  onProgress?: (progress: HealProgress) => void;
}): Promise<FirstRunSetupResult> {
  await whenBrowserStorageReady();
  const cache = loadSettingsCache();
  const shared = {
    ...cache.shared,
    useSystemWorkflows: true,
    ...(cache.shared.queueQualityProfile === 'followSettings' ||
    cache.shared.queueQualityProfile == null
      ? { queueQualityProfile: 'final' as const }
      : {}),
  };

  const suggested = mergeSuggestedLoaderMaps({
    checkpointMap: shared.modelCheckpointMap,
    vaeMap: shared.modelVaeMap,
    refinerMap: shared.modelRefinerMap,
  });
  shared.modelCheckpointMap = suggested.modelCheckpointMap;
  shared.modelVaeMap = suggested.modelVaeMap;
  shared.modelRefinerMap = suggested.modelRefinerMap;

  await setUseSystemWorkflowsPref(true, {
    queueQualityProfile:
      cache.shared.queueQualityProfile === 'followSettings' ||
      cache.shared.queueQualityProfile == null
        ? 'final'
        : cache.shared.queueQualityProfile,
  });
  saveSettingsCache({
    ...loadSettingsCache(),
    shared: {
      ...loadSettingsCache().shared,
      modelCheckpointMap: shared.modelCheckpointMap,
      modelVaeMap: shared.modelVaeMap,
      modelRefinerMap: shared.modelRefinerMap,
    },
  });
  markOnboardingSystemWorkflowsEnabled();
  await flushBrowserStorageNow();
  options?.onProgress?.({
    phase: 'maps',
    message: 'System workflows on. Adapting loader maps…',
  });

  const settings = loadComfyUiSettings();
  const comfyUrl = options?.comfyUrl?.trim() || settings.apiUrl?.trim() || undefined;

  try {
    const { scanAndAdaptSystemWorkflowInventory } = await import('../comfyui/runtime-for-model');
    const models = await scanAndAdaptSystemWorkflowInventory({
      comfyUrl,
      persist: true,
    });
    if (models) {
      const adapted = loadSettingsCache().shared;
      const objectInfo = await fetchComfyObjectInfoCached({
        comfyUrl,
        forceRefresh: true,
      });
      if (objectInfo?.models) {
        const synced = syncLoaderMapsFromInventory({
          models: objectInfo.models,
          checkpointMap: adapted.modelCheckpointMap,
          vaeMap: adapted.modelVaeMap,
          upscaleMap: adapted.modelUpscaleMap,
          controlNetMap: adapted.modelControlNetMap,
          healMissing: true,
        });
        const next = loadSettingsCache();
        saveSettingsCache({
          ...next,
          shared: {
            ...next.shared,
            modelCheckpointMap: synced.modelCheckpointMap,
            modelVaeMap: synced.modelVaeMap,
            modelUpscaleMap: synced.modelUpscaleMap,
            modelControlNetMap: synced.modelControlNetMap,
          },
        });
        await flushBrowserStorageNow();
      }
      const nodeHeal = await healMissingNodesOnPool(comfyUrl, options?.onProgress);
      return {
        ok: true,
        comfyOk: true,
        systemWorkflowsEnabled: true,
        mapsAdapted: true,
        message: [
          'Saved — system workflows on. Loader maps adapted from ComfyUI inventory.',
          nodeHeal.message,
        ]
          .filter(Boolean)
          .join(' '),
        nodesInstalled: nodeHeal.installed,
        nodesUnresolved: nodeHeal.unresolved,
        restartRequested: nodeHeal.restartRequested,
        hostsHealed: nodeHeal.hostsHealed,
      };
    }
  } catch {
    // fall through
  }

  const nodeHeal = await healMissingNodesOnPool(comfyUrl, options?.onProgress);
  if (nodeHeal.hostsHealed > 0 || nodeHeal.installed.length > 0) {
    return {
      ok: true,
      comfyOk: true,
      systemWorkflowsEnabled: true,
      mapsAdapted: false,
      message: [
        'Saved — system workflows on. Loader maps will adapt on next inventory sync.',
        nodeHeal.message,
      ]
        .filter(Boolean)
        .join(' '),
      nodesInstalled: nodeHeal.installed,
      nodesUnresolved: nodeHeal.unresolved,
      restartRequested: nodeHeal.restartRequested,
      hostsHealed: nodeHeal.hostsHealed,
    };
  }

  return {
    ok: true,
    comfyOk: false,
    systemWorkflowsEnabled: true,
    mapsAdapted: false,
    message:
      'Saved — system workflows on. ComfyUI not reachable yet; maps adapt on next connection.',
  };
}

/** Refresh health + enable/heal in one shot for Settings Overview / welcome. */
export async function runHealAndReady(options?: {
  comfyUrl?: string;
  onProgress?: (progress: HealProgress) => void;
}): Promise<FirstRunSetupResult> {
  let llmOk = false;
  let comfyOk = false;
  options?.onProgress?.({ phase: 'health', message: 'Checking LLM and ComfyUI health…' });
  try {
    const params = new URLSearchParams();
    if (options?.comfyUrl?.trim()) {
      params.set('comfyUrl', options.comfyUrl.trim());
    }
    const query = params.toString();
    const response = await fetch(query ? `/api/health?${query}` : '/api/health');
    const health = (await response.json()) as {
      llm?: { ok?: boolean };
      comfyui?: { ok?: boolean };
    };
    llmOk = Boolean(health.llm?.ok);
    comfyOk = Boolean(health.comfyui?.ok);
    if (llmOk) {
      markOnboardingLlmHealthOk();
    }
    if (comfyOk) {
      markOnboardingComfyHealthOk();
    }
  } catch {
    // continue heal attempt
  }

  const heal = await enableSystemWorkflowsAndHeal(options);
  return {
    ...heal,
    comfyOk: heal.comfyOk || comfyOk,
    llmOk,
    message: [
      llmOk ? 'LLM ok' : 'LLM not ready',
      heal.comfyOk || comfyOk ? 'ComfyUI ok' : 'ComfyUI unreachable',
      heal.message,
    ].join(' · '),
  };
}

/** Refresh Settings textareas after heal. */
export function readAdaptedLoaderMapTexts(): {
  checkpoint: string;
  vae: string;
  refiner: string;
  upscale: string;
  controlNet: string;
} {
  const shared = loadSettingsCache().shared;
  return {
    checkpoint: formatModelCheckpointMap(shared.modelCheckpointMap),
    vae: formatModelVaeMap(shared.modelVaeMap),
    refiner: formatModelRefinerMap(shared.modelRefinerMap),
    upscale: formatModelUpscaleMap(shared.modelUpscaleMap),
    controlNet: formatModelControlNetMap(shared.modelControlNetMap),
  };
}

async function healMissingNodesOnPool(
  primaryUrl?: string,
  onProgress?: (progress: HealProgress) => void
): Promise<{
  message: string;
  installed: string[];
  unresolved: string[];
  restartRequested: boolean;
  hostsHealed: number;
}> {
  const { installMissingWorkflowNodePacks, listHealComfyUrls } =
    await import('../comfyui/manager-install-client');
  const urls = await listHealComfyUrls(primaryUrl);
  const installed: string[] = [];
  const unresolved: string[] = [];
  let restartRequested = false;
  const hostNotes: string[] = [];
  let hostsHealed = 0;

  for (const [index, url] of urls.entries()) {
    onProgress?.({
      phase: 'host',
      host: url,
      hostIndex: index + 1,
      hostCount: urls.length,
      message:
        urls.length > 1
          ? `Checking ${url} (${index + 1}/${urls.length}) for missing custom nodes…`
          : `Checking ${url} for missing custom nodes…`,
    });
    const result = await installMissingWorkflowNodePacks(url);
    if (result.ok) {
      hostsHealed += 1;
    }
    for (const name of result.installed) {
      if (!installed.includes(name)) {
        installed.push(name);
      }
    }
    for (const name of result.unresolved) {
      if (!unresolved.includes(name)) {
        unresolved.push(name);
      }
    }
    restartRequested = restartRequested || result.restartRequested;
    if (result.message) {
      const note = urls.length > 1 ? `${url}: ${result.message}` : result.message;
      hostNotes.push(note);
      onProgress?.({
        phase: 'host',
        host: url,
        hostIndex: index + 1,
        hostCount: urls.length,
        message: note,
      });
    } else if (!result.ok) {
      const note =
        urls.length > 1
          ? `${url}: heal failed (host unreachable or object_info empty).`
          : 'Heal failed (host unreachable or object_info empty).';
      hostNotes.push(note);
    }
  }

  const prefix = urls.length > 1 ? `Checked ${urls.length} ComfyUI hosts.` : '';
  return {
    message: [prefix, ...hostNotes].filter(Boolean).join(' '),
    installed,
    unresolved,
    restartRequested,
    hostsHealed,
  };
}
