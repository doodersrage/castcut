/**
 * Named queue-behavior profiles for Settings → Patching.
 * Maps to the individual enrich / patch toggles without forcing users
 * through a checkbox farm for the common cases.
 */

import type { SharedToolSettings } from './settings-cache';

export type QueueBehaviorProfileId = 'reliable' | 'studio' | 'raw';

export type QueueBehaviorProfile = {
  id: QueueBehaviorProfileId;
  label: string;
  description: string;
  shared: Partial<SharedToolSettings>;
};

/** Play-safe defaults — patch + enrich on, leave imported loader filenames alone. */
export const QUEUE_BEHAVIOR_RELIABLE: QueueBehaviorProfile = {
  id: 'reliable',
  label: 'Reliable',
  description:
    'Recommended for Play. Patch size/loaders, optimize imports, enrich Final/Max polish. Keeps hand-picked weights inside workflow JSON.',
  shared: {
    directWorkflowPatching: true,
    syncWorkflowLoadersToModel: false,
    workflowQueueOptimize: true,
    compactDraftSaves: true,
    workflowGraphEnrich: true,
    workflowSdxlRefinerEnrich: true,
    workflowNeuralUpscalePolish: true,
    workflowSharpenAfterUpscale: true,
    useLibraryUpscaleWorkflow: false,
  },
};

/** Power Studio — also overwrite hardcoded loaders when switching model families. */
export const QUEUE_BEHAVIOR_STUDIO: QueueBehaviorProfile = {
  id: 'studio',
  label: 'Studio',
  description:
    'Reliable plus sync loaders to the target model on every queue (better when hopping model families on imported graphs).',
  shared: {
    ...QUEUE_BEHAVIOR_RELIABLE.shared,
    syncWorkflowLoadersToModel: true,
    useLibraryUpscaleWorkflow: true,
  },
};

/** Debug / compare — disable app patching so community JSON runs as authored. */
export const QUEUE_BEHAVIOR_RAW: QueueBehaviorProfile = {
  id: 'raw',
  label: 'Raw',
  description:
    'Minimal intervention — turn off direct patching, optimize, and graph enrich to compare against stock workflow JSON.',
  shared: {
    directWorkflowPatching: false,
    syncWorkflowLoadersToModel: false,
    workflowQueueOptimize: false,
    compactDraftSaves: false,
    workflowGraphEnrich: false,
    workflowSdxlRefinerEnrich: false,
    workflowNeuralUpscalePolish: false,
    workflowSharpenAfterUpscale: false,
    useLibraryUpscaleWorkflow: false,
  },
};

export const QUEUE_BEHAVIOR_PROFILES: QueueBehaviorProfile[] = [
  QUEUE_BEHAVIOR_RELIABLE,
  QUEUE_BEHAVIOR_STUDIO,
  QUEUE_BEHAVIOR_RAW,
];

const PROFILE_KEYS = [
  'directWorkflowPatching',
  'syncWorkflowLoadersToModel',
  'workflowQueueOptimize',
  'compactDraftSaves',
  'workflowGraphEnrich',
  'workflowSdxlRefinerEnrich',
  'workflowNeuralUpscalePolish',
  'workflowSharpenAfterUpscale',
  'useLibraryUpscaleWorkflow',
] as const satisfies ReadonlyArray<keyof SharedToolSettings>;

function boolOrDefault(value: boolean | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value;
}

function profileMatches(shared: SharedToolSettings, profile: QueueBehaviorProfile): boolean {
  for (const key of PROFILE_KEYS) {
    const expected = profile.shared[key];
    if (typeof expected !== 'boolean') {
      continue;
    }
    const actual = shared[key];
    const defaults: Record<(typeof PROFILE_KEYS)[number], boolean> = {
      directWorkflowPatching: true,
      syncWorkflowLoadersToModel: false,
      workflowQueueOptimize: true,
      compactDraftSaves: true,
      workflowGraphEnrich: true,
      workflowSdxlRefinerEnrich: true,
      workflowNeuralUpscalePolish: true,
      workflowSharpenAfterUpscale: true,
      useLibraryUpscaleWorkflow: false,
    };
    if (boolOrDefault(actual as boolean | undefined, defaults[key]) !== expected) {
      return false;
    }
  }
  return true;
}

/** Detect which named profile matches current settings, or null if custom. */
export function detectQueueBehaviorProfile(
  shared: SharedToolSettings
): QueueBehaviorProfileId | null {
  for (const profile of QUEUE_BEHAVIOR_PROFILES) {
    if (profileMatches(shared, profile)) {
      return profile.id;
    }
  }
  return null;
}

export function getQueueBehaviorProfile(
  id: string | null | undefined
): QueueBehaviorProfile | undefined {
  return QUEUE_BEHAVIOR_PROFILES.find(profile => profile.id === id);
}

export function applyQueueBehaviorProfile(
  id: QueueBehaviorProfileId
): Partial<SharedToolSettings> | null {
  return getQueueBehaviorProfile(id)?.shared ?? null;
}
