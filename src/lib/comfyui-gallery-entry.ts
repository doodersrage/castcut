import type { ComfyOutputImage } from './comfyui-outputs';
import type { WorkflowParamValues } from './comfyui-config';
import type { ComfyGalleryJobStatus } from './comfyui-gallery-types';

export type GalleryPlayChecks = {
  pose?: number;
  face?: number;
  poseMiss?: boolean;
  faceMiss?: boolean;
  at: number;
};

export type ComfyGalleryEntry = {
  id: string;
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  /** Links back to Studio prompt history entry. */
  historyId?: string;
  /** Gallery entry this job was derived from (upscale, refine, variation). */
  parentGalleryEntryId?: string;
  /** Character OS record this job was queued as. */
  characterId?: string;
  /** Character look id active at queue time. */
  lookId?: string;
  /** How this entry was derived from parentGalleryEntryId. */
  derivedKind?:
    | 'upscale'
    | 'refine'
    | 'soft-pass'
    | 'variation'
    | 'moire-clean'
    | 'face-detail'
    | 'controlnet'
    | 'i2v'
    | 't2v'
    | 'extend'
    | 'film';
  /** Resolved queue params (seed, width, cfg, etc.). */
  queueParams?: WorkflowParamValues;
  /**
   * Exact workflow JSON queued for this job (capped). Preferred for exact replay
   * before fetching ComfyUI history. May be omitted from list projections —
   * see `hasStoredWorkflow` + `getGalleryEntryById`.
   */
  workflowJson?: string;
  /** True when a stored graph exists (list projection may omit the JSON body). */
  hasStoredWorkflow?: boolean;
  /** Set when the queued graph was too large to persist for exact replay. */
  workflowJsonOmitted?: boolean;
  /** Original source image URL at queue time (Comfy view or app proxy). */
  sourceImageUrl?: string;
  /** Inpaint mask URL at queue time when available. */
  maskImageUrl?: string;
  /** ControlNet reference view URLs at queue time (multi-ref stack). */
  controlImageUrls?: string[];
  /** Queue quality profile used when this job was queued (draft / final / max). */
  queueQualityProfile?: import('./queue-quality-profile').QueueQualityProfile;
  /** Session LoRA library ids active when this job was queued (for re-edit same stack). */
  sessionActiveLoraIds?: string[];
  /** Session LoRA strength tweaks active when this job was queued. */
  sessionLoraStrengthOverrides?: import('./lora-stack').SessionLoraStrengthOverrides;
  /** Session textual-inversion stems active when this job was queued. */
  sessionEmbeddingTokens?: string[];
  /** Quick review rating from gallery review mode. */
  reviewRating?: 1 | 2 | 3 | 4 | 5;
  /** Short freeform review note from lightbox / review mode. */
  reviewNote?: string;
  /** Optional project/campaign id. */
  projectId?: string;
  /** Owner account when user auth is enabled. */
  userId?: string;
  comfyUrl: string;
  /** Inference engine that produced this job (`comfyui` default). */
  engineId?: import('./engine/types').EngineId;
  /** WebSocket client id used when queueing (for live latent previews). */
  clientId?: string;
  status: ComfyGalleryJobStatus;
  /** Optional vision-derived tags for search/filter. */
  visionTags?: string[];
  /** User-applied labels (distinct from LLM visionTags). */
  userTags?: string[];
  /** Named custom group assigned from gallery multi-select. One group per entry. */
  customGroup?: string;
  /**
   * Play checks of this still (Day Auto-review / Story pose check): pose and face match 0–1,
   * and whether each counted as a miss.
   */
  playChecks?: GalleryPlayChecks;
  /** Cached aesthetic score (0–100) from heuristic or vision. */
  aestheticScore?: number;
  /** How aestheticScore was produced. */
  aestheticScoreMethod?: 'heuristic' | 'vision' | 'embedding';
  statusMessage?: string;
  queuePosition?: number | null;
  /** Live sampler/node progress from ComfyUI WebSocket (cleared when finished). */
  progressValue?: number;
  progressMax?: number;
  progressNode?: string | null;
  queuedAt: number;
  completedAt?: number;
  /**
   * Durable thumb under PROMPT_DATA_DIR (`gallery-media/{owner}/{id}/thumb.webp`).
   * Stills only. Legacy single-value field — always mirrors index 0 of
   * `durableThumbPaths` below. Kept because several single-image call sites
   * (user uploads, film assembly, identity handoff) only ever address index 0
   * and read this field directly.
   */
  durableThumbPath?: string;
  /**
   * Durable full-resolution original under PROMPT_DATA_DIR
   * (`gallery-media/{owner}/{id}/original`) — set for user uploads/imports
   * and automatically for completed engine outputs (image or video, any
   * engine). When present, the gallery reads/plays from this copy instead of
   * proxying live to the source engine, so it survives the engine cleaning
   * up its own output history. Legacy single-value field — always mirrors
   * index 0 of `durableOriginalPaths` below.
   */
  durableOriginalPath?: string;
  /**
   * Per-image durable thumb presence, parallel to `images` (stills only —
   * entries with more than one output in a batch each get their own thumb).
   * `null`/missing at an index means that image isn't durably stored (still
   * falls back to the live engine proxy). Index 0 always mirrors
   * `durableThumbPath`.
   */
  durableThumbPaths?: (string | null)[];
  /**
   * Per-image durable original presence, parallel to `images`. `null`/missing
   * at an index means that image isn't durably stored. Index 0 always
   * mirrors `durableOriginalPath`.
   */
  durableOriginalPaths?: (string | null)[];
  /**
   * Workflow execution duration in ms (ComfyUI execution_start → success/error
   * when available; otherwise may be filled from queuedAt→completedAt wall clock).
   */
  renderDurationMs?: number;
  /** ComfyUI execution_start timestamp (ms) when parsed from history messages. */
  executionStartedAt?: number;
  favorite?: boolean;
  images: ComfyOutputImage[];
  /** Set once an OOM/execution_error auto-retry has been attempted for this job (max one retry). */
  oomRetryAttempted?: boolean;
  /** Cached corpus text — populated on hydration, reused across all semantic/similar searches. */
  _corpus?: string;
};
