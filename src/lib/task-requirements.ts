/**
 * What a task needs installed in ComfyUI — the few files and node packs for *this* job (a Day on
 * Rapid AIO, Animate, Face finish…), not every weight a model family could use. The tool page
 * shows one "Get what this needs" card with a single Download all instead of sending the player
 * through the Settings download list file by file.
 */

import { getCatalogAsset } from '@/lib/comfy-asset-catalog';

/** The smallest file set that runs each model (all-in-one checkpoints are one file). */
const MODEL_ASSETS: Record<string, string[]> = {
  'qwen-rapid-aio-edit': ['qwen-rapid-aio-sfw-checkpoint'],
  'qwen-rapid-aio-edit-nsfw': ['qwen-rapid-aio-nsfw-checkpoint'],
  'qwen-rapid-aio-sfw': ['qwen-rapid-aio-sfw-checkpoint'],
  'qwen-rapid-aio-nsfw': ['qwen-rapid-aio-nsfw-checkpoint'],
  'qwen-image-edit-2511': ['qwen-image-edit-2511-bf16', 'qwen-2.5-vl-7b-fp8', 'qwen-image-vae'],
  'qwen-image-edit-2511-lightning-4': [
    'qwen-image-edit-2511-bf16',
    'qwen-edit-lightning-4',
    'qwen-2.5-vl-7b-fp8',
    'qwen-image-vae',
  ],
  'qwen-image-edit-2511-lightning-8': [
    'qwen-image-edit-2511-bf16',
    'qwen-edit-lightning-8',
    'qwen-2.5-vl-7b-fp8',
    'qwen-image-vae',
  ],
  'wan-video-rapid-aio': ['wan-video-rapid-aio'],
  'flux-2-klein-9b-kv': ['flux2-klein-9b-kv', 'flux2-klein-qwen3-8b', 'flux2-vae'],
  // Rides the Rapid AIO NSFW edit graph (recipes + the penetration-duo fallback), renders on 2.1.
  'qwen-image-2.1-edit': [
    'qwen-image-2.1-bf16',
    'qwen-image-2.1-text-encoder',
    'qwen-image-2.1-vae',
    'qwen-rapid-aio-nsfw-checkpoint',
  ],
};

/** Custom-node packs, named by a node type ComfyUI Manager can resolve to its pack. */
const NODE_PACKS = {
  dwpose: { label: 'DWPose (ComfyUI ControlNet Aux)', nodeTypes: ['DWPreprocessor'] },
  faceAnalysis: {
    label: 'FaceAnalysis (InsightFace)',
    nodeTypes: ['FaceAnalysisModels', 'FaceEmbedDistance'],
  },
} as const;

export type TaskNodePack = { label: string; nodeTypes: readonly string[] };

export type TaskRequirements = {
  /** Catalog asset ids (see comfy-asset-catalog), de-duplicated, in order of need. */
  assetIds: string[];
  nodePacks: TaskNodePack[];
  /** Why each part is needed, for the card's one-line summary. */
  reasons: string[];
};

export type TaskRequirementInput = {
  /** The still model the tool queues with. */
  model?: string | null;
  /** Intimate / Raunchy on Rapid: the NSFW checkpoint renders the nude stills. */
  adult?: boolean;
  /** Animate is part of the job (Day / Story clips). */
  animate?: boolean;
  /** Face finish is on (identity-aware face pass on Qwen Edit 2511 + Lightning). */
  faceFinish?: boolean;
  /** Auto-review is on (pose and face checks). */
  autoReview?: boolean;
  /**
   * Models already runnable: their mapped checkpoint / UNet (Settings → checkpoint map) is in
   * ComfyUI. A player who points WAN Rapid at the NSFW file is never asked for the SFW one.
   */
  runnableModels?: ReadonlySet<string>;
};

function isRapidStillModel(model: string): boolean {
  return /^qwen-rapid-aio-/i.test(model);
}

export function taskRequirements(input: TaskRequirementInput): TaskRequirements {
  const assetIds: string[] = [];
  const nodePacks: TaskNodePack[] = [];
  const reasons: string[] = [];
  const addModel = (modelId: string, reason: string) => {
    if (!modelId || input.runnableModels?.has(modelId)) return;
    const fresh = (MODEL_ASSETS[modelId] ?? []).filter(
      id => getCatalogAsset(id) && !assetIds.includes(id)
    );
    if (fresh.length > 0) {
      assetIds.push(...fresh);
      reasons.push(reason);
    }
  };
  const model = input.model?.trim() ?? '';
  addModel(model, 'stills');
  if (input.adult && isRapidStillModel(model)) {
    // Nude Day / Story stills queue on the NSFW Edit model (resolveAdultNudePlateQueueModel).
    addModel('qwen-rapid-aio-edit-nsfw', 'adult stills');
  }
  if (input.animate) {
    addModel('wan-video-rapid-aio', 'clips');
  }
  if (input.faceFinish) {
    addModel('qwen-image-edit-2511-lightning-8', 'face finish');
  }
  if (input.autoReview) {
    nodePacks.push(NODE_PACKS.dwpose, NODE_PACKS.faceAnalysis);
    reasons.push('auto-review');
  }
  return { assetIds, nodePacks, reasons };
}

/** Models whose mapped checkpoint / UNet file ComfyUI already lists. */
export function runnableModelsFromMap(
  map: Record<string, string | undefined> | null | undefined,
  installedFiles: ReadonlyArray<string>
): Set<string> {
  const installed = new Set(installedFiles.map(name => name.split(/[\\/]/).pop()!.toLowerCase()));
  const out = new Set<string>();
  for (const [model, file] of Object.entries(map ?? {})) {
    const base = file?.split(/[\\/]/).pop()?.toLowerCase();
    if (base && installed.has(base)) out.add(model);
  }
  return out;
}

export type TaskAssetState = {
  id: string;
  status: 'installed' | 'missing' | 'docs-only' | 'root-missing';
  downloadable: boolean;
  bytes?: number;
};

/** Missing pieces of a requirement, given the asset rows and ComfyUI's node list. */
export function missingTaskRequirements(
  requirements: TaskRequirements,
  rows: TaskAssetState[],
  knownNodeTypes: ReadonlySet<string> | null
): {
  assets: TaskAssetState[];
  /** Missing but not downloadable here (docs-only / no models folder) — shown, not queued. */
  manual: TaskAssetState[];
  nodePacks: TaskNodePack[];
  bytes: number;
} {
  const byId = new Map(rows.map(row => [row.id, row]));
  const missing = requirements.assetIds
    .map(id => byId.get(id))
    .filter((row): row is TaskAssetState => Boolean(row && row.status !== 'installed'));
  const assets = missing.filter(row => row.downloadable && row.status === 'missing');
  const manual = missing.filter(row => !assets.includes(row));
  const nodePacks = knownNodeTypes
    ? requirements.nodePacks.filter(pack => pack.nodeTypes.some(type => !knownNodeTypes.has(type)))
    : [];
  return {
    assets,
    manual,
    nodePacks,
    bytes: assets.reduce((sum, row) => sum + (row.bytes ?? 0), 0),
  };
}

export function formatTaskBytes(bytes: number): string {
  if (bytes <= 0) return '';
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}
