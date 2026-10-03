/**
 * The engines a player picks, and the shape of their health — the light half of engine health,
 * safe for the header Engine chip's bundle. The checks live in engine-health (pure) and
 * engine-health-client (graph build + `/object_info`).
 */

import { LTX25_REQUIRED_NODE } from './ltx25-renderer';

export type EngineHealthEngine = {
  id: string;
  /** Short name, as the Engine chip / picker shows it. */
  label: string;
  /** Model id the engine queues with. */
  model: string;
  kind: 'still' | 'clip';
  /** Sibling model ids picked as the same engine (SFW Rapid, 4-step Lightning…). */
  aliases?: readonly string[];
  /**
   * Nodes the queue needs beyond the built graph: LTX-2.5 rides the WAN graph and is only
   * converted when ComfyUI has its nodes, so a missing LTX pack would otherwise look ready.
   */
  extraNodeTypes?: readonly string[];
};

/** The engines a player picks for Day / Story / Outfit stills and for Animate clips. */
export const ENGINE_HEALTH_ENGINES: readonly EngineHealthEngine[] = [
  {
    id: 'rapid',
    label: 'Rapid',
    model: 'qwen-rapid-aio-edit-nsfw',
    kind: 'still',
    aliases: ['qwen-rapid-aio-edit'],
  },
  {
    id: 'edit-2511',
    label: 'Edit 2511',
    model: 'qwen-image-edit-2511-lightning-8',
    kind: 'still',
    aliases: ['qwen-image-edit-2511', 'qwen-image-edit-2511-lightning-4'],
  },
  {
    id: 'qwen-21-pruna',
    label: '2.1 Pruna',
    model: 'qwen-image-2.1-edit-pruna-8',
    kind: 'still',
    aliases: ['qwen-image-2.1-edit', 'qwen-image-2.1-edit-lightning-4'],
  },
  {
    id: 'klein',
    label: 'Klein',
    model: 'flux-2-klein-9b-distilled',
    kind: 'still',
    aliases: ['flux-2-klein-9b', 'flux-2-klein-9b-kv', 'flux-2-klein-4b-distilled', 'flux-2-klein'],
  },
  {
    id: 'wan',
    label: 'WAN',
    model: 'wan-video-rapid-aio',
    kind: 'clip',
    aliases: ['wan-video', 'wan-video-lightning-4'],
  },
  {
    id: 'ltx-2.5',
    label: 'LTX-2.5',
    model: 'ltx-video-2.5',
    kind: 'clip',
    extraNodeTypes: [LTX25_REQUIRED_NODE],
  },
];

export function engineForModel(model: string | undefined): EngineHealthEngine | undefined {
  const id = model?.trim();
  return id
    ? ENGINE_HEALTH_ENGINES.find(engine => engine.model === id || engine.aliases?.includes(id))
    : undefined;
}

export type EngineHealthState = 'ready' | 'missing-node' | 'missing-model' | 'unknown';

export type EngineModelFolder =
  | 'checkpoints'
  | 'unets'
  | 'vaes'
  | 'clips'
  | 'loras'
  | 'controlNets'
  | 'upscaleModels'
  | 'clipVisions';

export type EngineModelRequirement = {
  classType: string;
  input: string;
  folder: EngineModelFolder;
  filename: string;
};

export type EngineHealthStatus = {
  state: EngineHealthState;
  missingNodes: string[];
  missingModels: EngineModelRequirement[];
  /** Pack names ComfyUI-Manager can install for the missing nodes, when known. */
  nodePacks: string[];
  /** "Ready", "Missing node X", "Missing model Y (+2 more)", … */
  summary: string;
};

export type EngineHealth = EngineHealthStatus & {
  model: string;
  /** ComfyUI URL the check ran against ('' = the server's default). */
  comfyUrl: string;
  checkedAt: number;
  /** Why the graph could not be built, when it could not. */
  error?: string;
};

/** Short chip text: "Ready" / "Missing node" / "Missing model" / "Not checked". */
export function engineHealthChipLabel(state: EngineHealthState): string {
  switch (state) {
    case 'ready':
      return 'Ready';
    case 'missing-node':
      return 'Missing node';
    case 'missing-model':
      return 'Missing model';
    default:
      return 'Not checked';
  }
}
