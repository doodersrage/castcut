'use client';

/**
 * A test-only record of each sendComfyUi call (FINISHING_PLAN Phase 3): when a page sets
 * `window.__castcutQueueCalls = []`, every queue call is noted with what it was asked and the
 * settings it read, so the golden take test can rebuild the same request on the server
 * (queue-request-server.ts) and compare. Nothing is recorded otherwise.
 */
import type { AthleticSport } from '../scene/athletic-sport-profiles';
import type { SendComfyUiOptions } from '@/hooks/prompt-result/comfy-ui-types';
// Static, and all already on the page with sendComfyUi: the record adds no chunk of its own.
import { getCharacter } from '../character/os';
import { readCachedComfyObjectInfoModels } from '../comfyui/object-info-cache';
import { loadComfyUiSettings } from '../comfyui/settings';
import { loadComfyWorkflowFiles } from '../comfyui/workflow-files';
import { loadModelSamplerMemory } from '../history/sampler-memory';
import { loadSettingsCache } from '../settings/cache';
import { loadQueueParamsSettings } from './params-settings';

export type RecordedQueueCall = {
  prompt: string;
  sport?: AthleticSport | null;
  options?: SendComfyUiOptions;
  config: { model: string; tool: string; hints?: string };
  settings: import('./queue-request-server').ServerQueueSettings;
  inventory: import('../comfyui/object-info').ComfyUiModelLists | null;
  character?: import('../character/os').CharacterRecord;
};

declare global {
  interface Window {
    __castcutQueueCalls?: RecordedQueueCall[];
  }
}

/** Whether a test asked for the record (synchronous: the page's own queue waits on nothing). */
export function recordingQueueCalls(): boolean {
  return typeof window !== 'undefined' && Array.isArray(window.__castcutQueueCalls);
}

export function recordQueueCallForTests(
  call: Pick<RecordedQueueCall, 'prompt' | 'sport' | 'options' | 'config'>
): void {
  if (typeof window === 'undefined' || !Array.isArray(window.__castcutQueueCalls)) return;
  const shared = loadSettingsCache().shared;
  const character = getCharacter(shared.activeCharacterId?.trim());
  window.__castcutQueueCalls.push(
    JSON.parse(
      JSON.stringify({
        ...call,
        settings: {
          shared,
          comfyUi: loadComfyUiSettings(),
          workflowFiles: loadComfyWorkflowFiles(),
          queueParams: loadQueueParamsSettings(),
          samplerMemory: loadModelSamplerMemory(),
        },
        inventory: readCachedComfyObjectInfoModels() ?? null,
        ...(character ? { character } : {}),
      })
    )
  );
}
