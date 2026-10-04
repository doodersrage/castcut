import type { MutableRefObject } from 'react';
import type { AthleticSport } from '@/lib/athletic-sport-profiles';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import type { ComfyUiJobTrackerState } from '@/lib/comfyui-job-status';
import type { PromptResultActionsConfig, WorkflowPreviewResult } from '@/hooks/prompt-result/types';

export type ComfyUiDeps = {
  saveHistory: (input: {
    prompt: string;
    hints?: string;
    metadata?: Record<string, unknown>;
    parentHistoryId?: string;
  }) => string | undefined;
  historySaved: boolean;
};

export type SendComfyUiOptions = {
  explicitNegative?: string;
  inputImage?: File | null;
  inputImageFilename?: string;
  inputImageUrl?: string;
  /** Extra figures for Compose (Figure 2–4). Index 0 is ignored — use inputImage. */
  inputImages?: Array<File | null | undefined>;
  inputImageUrls?: Array<string | undefined>;
  inputImageFilenames?: string[];
  maskImage?: File | null;
  maskImageFilename?: string;
  maskImageUrl?: string;
  controlImage?: File | null;
  controlImageFilename?: string;
  controlImageUrl?: string;
  /** Extra control images for multi-ControlNet stack (index 0 ignored — use controlImage). */
  controlImages?: Array<File | null | undefined>;
  controlImageUrls?: Array<string | undefined>;
  controlImageFilenames?: string[];
  queueParamsBase?: WorkflowParamValues;
  qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile;
  resolutionSizeTier?: import('@/lib/model-resolution-defaults').ResolutionSizeTier;
  resolutionOrientation?: import('@/lib/model-resolution-defaults').ResolutionOrientation;
  /** When false, keep queueParamsBase W×H instead of Lightning compose upsnap. */
  preserveInputAspect?: boolean;
  /** Override probed upload dimensions (e.g. locked fitting preview thumbs). */
  figurePixelSize?: { width: number; height: number };
  /**
   * Cast plate is Image 1. The latent takes the plate's aspect and size (not the
   * sidebar orientation); Lightning snaps to its ladder.
   */
  castPlateReference?: boolean;
  /**
   * Queue with this seed instead of a fresh one (every queue rolls a new seed otherwise). Day's
   * "Same seed" redo: change the scene, keep the take.
   */
  seed?: string;
  /** Skip graph enrich passes for tiny fitting draft thumbs. */
  draftPreviewLite?: boolean;
  /** Merged into runtime customTokens before inject (e.g. {{REGION_*}}). */
  customTokens?: Array<{ token: string; value: string }>;
  /** Multi-slot regional edit for AttentionCouple / {{REGION_*}} binding. */
  regionalSlots?: import('@/lib/regional-prompt-slots').RegionalPromptSlot[];
  /** Compose: lock identity from Figure 1 via IP-Adapter after upload. */
  identityLock?: boolean;
  identityLockStrength?: number;
  identityKind?: import('@/lib/compose-identity-lock').ComposeIdentityKind;
  /** Gallery lineage when queueing a derived job (e.g. ControlNet from gallery). */
  parentGalleryEntryId?: string;
  characterId?: string;
  lookId?: string;
  derivedKind?: import('@/lib/comfyui-gallery-entry').ComfyGalleryEntry['derivedKind'];
  sourceImageUrl?: string;
  /** Override the hook tool for this queue (Roleplay → video I2V). */
  queueTool?: string;
  queueModel?: ComfyImageModel;
  /** Video T2V vs I2V vs documented Fal extend. */
  clipMode?: import('@/lib/video-clip-mode').VideoClipMode;
  /** Public Fal clip URL for clipMode extend. */
  videoUrl?: string;
  /** Override shared turbo edit strength for this queue (e.g. fitting draft previews). */
  turboEditStrength?: import('@/lib/turbo-edit-strength').TurboEditStrength;
  /** Override hook hints for this queue — pass '' to skip tool notes on previews. */
  queueHints?: string;
  /**
   * Job-pinned session LoRA stack (e.g. Cast loraLibraryIds on Day).
   * When set, overrides Shared session / by-model picks for this queue only.
   */
  sessionActiveLoraIds?: string[];
  /** Job-pinned LoRA strength tweaks for this queue only. */
  sessionLoraStrengthOverrides?: import('@/lib/lora-stack').SessionLoraStrengthOverrides;
  /**
   * An adult still for the adult-appearance gate: the gallery entry is registered `pending`
   * (hidden everywhere, no result preview) until the gate passes it. `strong`: this take uses
   * the stronger age sentence (the one requeue after a withheld take). `covered`: it uses the
   * strong coverage line (the one requeue after bare skin on a clothed-mood still).
   */
  adultGate?: { strong?: boolean; covered?: boolean };
};

export type TrackComfyUiJobInput = {
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  comfyUrl: string;
  clientId?: string;
  historyId?: string;
  queueParams?: WorkflowParamValues;
  workflowJson?: string;
  parentGalleryEntryId?: string;
  characterId?: string;
  lookId?: string;
  derivedKind?: import('@/lib/comfyui-gallery-entry').ComfyGalleryEntry['derivedKind'];
  sourceImageUrl?: string;
  maskImageUrl?: string;
  queueQualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile;
  /** Actual model queued (may differ from picker when Generate remaps Edit Lightning). */
  model?: ComfyImageModel;
  tool?: string;
  sessionActiveLoraIds?: string[];
  sessionLoraStrengthOverrides?: import('@/lib/lora-stack').SessionLoraStrengthOverrides;
  engineId?: import('@/lib/engine/types').EngineId;
  /** Registered held by the adult-appearance gate (SendComfyUiOptions.adultGate). */
  adultCheck?: import('@/lib/gallery-adult-check').GalleryAdultCheck;
};

export type ComfyUiTrackerApi = {
  previewGenerationRef: MutableRefObject<number>;
  identityRelocateAttemptRef: MutableRefObject<boolean>;
  comfyUiStatus: string | null;
  comfyUiJob: ComfyUiJobTrackerState | null;
  comfyUiPreviewUrl: string | null;
  workflowPreview: WorkflowPreviewResult | null;
  previewStatus: string | null;
  setComfyUiStatus: React.Dispatch<React.SetStateAction<string | null>>;
  setComfyUiJob: React.Dispatch<React.SetStateAction<ComfyUiJobTrackerState | null>>;
  setComfyUiPreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setWorkflowPreview: React.Dispatch<React.SetStateAction<WorkflowPreviewResult | null>>;
  setPreviewStatus: React.Dispatch<React.SetStateAction<string | null>>;
  trackComfyUiJob: (input: TrackComfyUiJobInput, showPreview?: boolean) => void;
};

export type ComfyUiQueueContext = {
  config: PromptResultActionsConfig;
  deps: ComfyUiDeps;
  tracker: ComfyUiTrackerApi;
};

export type SendComfyUiFn = (
  prompt: string,
  sport?: AthleticSport | null,
  historyId?: string,
  options?: SendComfyUiOptions
) => Promise<string | undefined>;
