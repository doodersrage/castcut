import type { ComfyWorkflowPreset } from '../comfyui/workflow-presets';
import { upsertComfyWorkflowFile } from '../comfyui/workflow-files';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import { optimizeWorkflowForQueue } from './queue-optimizer';
import { normalizeQueueQualityProfile } from '../queue/quality-profile';
import { workflowContentHash } from './content-hash';
import { loadSettingsCache } from '../settings/cache';
import { inferModelsFromWorkflowLabel } from './category-defaults';

export const WORKFLOW_PRESET_PACKS_KEY = 'comfyui-workflow-preset-packs-v1';

export type WorkflowPresetPack = {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  createdAt: number;
  presets: ComfyWorkflowPreset[];
};

export function loadWorkflowPresetPacks(): WorkflowPresetPack[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return readBrowserValue<WorkflowPresetPack[]>(WORKFLOW_PRESET_PACKS_KEY) ?? [];
  } catch {
    return [];
  }
}

export function saveWorkflowPresetPacks(packs: WorkflowPresetPack[]): void {
  if (typeof window === 'undefined') return;
  writeBrowserValue(WORKFLOW_PRESET_PACKS_KEY, packs);
}

export function exportWorkflowPresetPack(pack: WorkflowPresetPack): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      pack,
    },
    null,
    2
  );
}

export function importWorkflowPresetPack(raw: string): WorkflowPresetPack {
  const parsed = JSON.parse(raw) as { pack?: WorkflowPresetPack } | WorkflowPresetPack;
  const pack = 'pack' in parsed && parsed.pack ? parsed.pack : (parsed as WorkflowPresetPack);
  if (!pack?.name || !Array.isArray(pack.presets)) {
    throw new Error('Invalid workflow preset pack JSON.');
  }
  return {
    ...pack,
    id: pack.id || crypto.randomUUID(),
    createdAt: pack.createdAt || Date.now(),
    tags: pack.tags ?? [],
  };
}

export function upsertWorkflowPresetPack(pack: WorkflowPresetPack): void {
  const packs = loadWorkflowPresetPacks();
  const index = packs.findIndex(entry => entry.id === pack.id);
  if (index >= 0) {
    packs[index] = pack;
  } else {
    packs.unshift(pack);
  }
  saveWorkflowPresetPacks(packs);
}

export function workflowFileToPreset(input: {
  id?: string;
  name: string;
  workflowJson: string;
  createdAt?: number;
  customTokens?: import('../comfyui/config').CustomWorkflowToken[];
}): ComfyWorkflowPreset {
  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    createdAt: input.createdAt ?? Date.now(),
    workflowJson: input.workflowJson,
    customTokens: input.customTokens,
  };
}

export function addPresetsToPack(
  packId: string,
  presets: ComfyWorkflowPreset[]
): WorkflowPresetPack | null {
  const packs = loadWorkflowPresetPacks();
  const index = packs.findIndex(entry => entry.id === packId);
  if (index < 0) {
    return null;
  }
  const existingIds = new Set(packs[index].presets.map(preset => preset.id));
  const merged = [...packs[index].presets];
  for (const preset of presets) {
    if (!existingIds.has(preset.id)) {
      merged.push(preset);
      existingIds.add(preset.id);
    }
  }
  packs[index] = { ...packs[index], presets: merged };
  saveWorkflowPresetPacks(packs);
  return packs[index];
}

export function applyWorkflowPresetPackToLibrary(pack: WorkflowPresetPack): number {
  if (typeof window === 'undefined') {
    return 0;
  }
  const shared = loadSettingsCache().shared;
  let count = 0;
  for (const preset of pack.presets) {
    let workflowJson = preset.workflowJson;
    let lastOptimizedHash: string | undefined;
    const optimizeModel =
      inferModelsFromWorkflowLabel({ name: preset.name, filename: `${preset.name}.json` })[0] ??
      shared.model;
    try {
      const parsed = JSON.parse(workflowJson) as Record<string, unknown>;
      const optimized = optimizeWorkflowForQueue({
        workflow: parsed,
        tokens: {
          positive: '{{POSITIVE}}',
          negative: '{{NEGATIVE}}',
          seed: '{{SEED}}',
          width: '{{WIDTH}}',
          height: '{{HEIGHT}}',
          cfg: '{{CFG}}',
          steps: '{{STEPS}}',
          sampler: '{{SAMPLER}}',
          scheduler: '{{SCHEDULER}}',
          shift: '{{SHIFT}}',
          fluxMaxShift: '{{FLUX_MAX_SHIFT}}',
          fluxBaseShift: '{{FLUX_BASE_SHIFT}}',
          denoise: '{{DENOISE}}',
          inputImage: '{{INPUT_IMAGE}}',
          maskImage: '{{MASK_IMAGE}}',
          initImage: '{{INIT_IMAGE}}',
          videoFrames: '{{VIDEO_FRAMES}}',
          videoFps: '{{VIDEO_FPS}}',
        },
        model: optimizeModel,
        qualityProfile: shared.queueQualityProfile,
        enrichGraph: shared.workflowGraphEnrich !== false,
      });
      workflowJson = optimized.workflowJson;
      lastOptimizedHash = optimized.contentHash;
    } catch {
      // keep raw preset JSON when optimize fails
    }

    upsertComfyWorkflowFile({
      id: preset.id,
      name: preset.name,
      workflowJson,
      createdAt: preset.createdAt,
      customTokens: preset.customTokens,
      lastOptimizedAt: Date.now(),
      lastOptimizedHash: lastOptimizedHash ?? workflowContentHash(workflowJson),
      lastOptimizedModel: String(optimizeModel),
      lastOptimizedProfile: normalizeQueueQualityProfile(shared.queueQualityProfile),
    });
    count += 1;
  }
  return count;
}
