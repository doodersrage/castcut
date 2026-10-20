import type { ComfyImageModel } from '../comfy-models/client';
import type { DetailLevel } from '../prompt/detail-level';
import type { LlmRequestOptions } from '../llm/request-options';

export type ToolLimits = {
  minChars?: number;
  maxChars: number;
  maxSentences: number;
  maxTokens: number;
};

export type ToolGenerateResult = {
  prompt: string;
  provider: 'llm' | 'template';
  model: ComfyImageModel;
  comfyNode: string;
  limits: ToolLimits;
  seed?: string;
  metadata?: Record<string, unknown>;
};

export type SharedGenerationOptions = {
  model: ComfyImageModel;
  detail: DetailLevel;
  llm?: LlmRequestOptions;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export type RandomSceneOptions = SharedGenerationOptions & {
  genre?: string;
  includePeople?: boolean;
  wildness?: number;
  recentLocations?: string[];
  recentClothing?: string[];
  blockedLocations?: string[];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  /** When set, reuse this environment/variation seed instead of rolling random. */
  variationSeed?: string;
  alwaysIncludeClothing?: boolean;
  /** When false, skip location/wardrobe/environment ingredient seeds for the LLM. */
  seedLlmWithIngredients?: boolean;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

import type { CharacterPresetOptions } from '../character/options';

export type CharacterOptions = SharedGenerationOptions & {
  hints?: string;
  portraitStyle?: 'portrait' | 'full-body' | 'action';
  variationStrength?: number;
  presetOptions?: CharacterPresetOptions;
  recentLocations?: string[];
  recentClothing?: string[];
  blockedLocations?: string[];
  /** Pin a catalog wardrobe entry instead of rolling random outfit. */
  lockedWardrobeId?: string;
  /** Pin scene location via location: hint. */
  lockedLocation?: string;
  /** Reuse a pinned variation/environment seed. */
  variationSeed?: string;
  /** When true (default), roll catalog wardrobe unless presets specify clothing. */
  alwaysIncludeClothing?: boolean;
  /** When false, skip location/wardrobe/environment ingredient seeds for the LLM. */
  seedLlmWithIngredients?: boolean;
  /** Force identical kits for athletic duos (teammates vs rival accents). */
  teamKit?: boolean;
  /** Pinned appearance descriptor injected into every character prompt. */
  activeCharacterDescriptor?: string;
};

import type { GenerationDiagnostics } from '../queue/generation-diagnostics';

export type EnrichedToolGenerateResult = ToolGenerateResult & {
  diagnostics?: GenerationDiagnostics;
};

import type { BackgroundPresetOptions } from '../scene/background-options';
import type { FantasyPresetOptions, FantasyShotFraming } from '../scene/fantasy-options';
import type { PetPresetOptions } from '../scene/pet-options';

export type BackgroundOptions = SharedGenerationOptions & {
  settingType?: string;
  timeOfDay?: string;
  mood?: string;
  presetOptions?: BackgroundPresetOptions;
  recentLocations?: string[];
  blockedLocations?: string[];
};

export type PetOptions = SharedGenerationOptions & {
  hints?: string;
  portraitStyle?: 'portrait' | 'full-body' | 'action';
  variationStrength?: number;
  presetOptions?: PetPresetOptions;
  recentLocations?: string[];
  blockedLocations?: string[];
  lockedLocation?: string;
  variationSeed?: string;
};

export type FantasyOptions = SharedGenerationOptions & {
  hints?: string;
  portraitStyle?: FantasyShotFraming;
  wildness?: number;
  variationStrength?: number;
  presetOptions?: FantasyPresetOptions;
  recentLocations?: string[];
  recentClothing?: string[];
  blockedLocations?: string[];
  lockedLocation?: string;
  lockedWardrobeId?: string;
  variationSeed?: string;
  alwaysIncludeClothing?: boolean;
  /** When false, skip location/wardrobe/environment ingredient seeds for the LLM. */
  seedLlmWithIngredients?: boolean;
};

export type ImagePromptFocus = 'full' | 'subject' | 'background' | 'style';

export type ImagePromptOptions = SharedGenerationOptions & {
  imageDataUrl: string;
  mimeType?: string;
  focus?: ImagePromptFocus;
  descriptionPreset?: import('../prompt/image-prompt-presets').ImagePromptDescriptionPreset;
  extraHints?: string;
};

export type LogoOptions = SharedGenerationOptions & {
  brandName?: string;
  tagline?: string;
  industry?: string;
  stylePreset?: import('../app/logo-presets').LogoStylePresetId;
  motif?: import('../app/logo-presets').LogoMotifId;
  includeWordmark?: boolean;
  extraNotes?: string;
};

export type TopicOptions = {
  seedTopic?: string;
  count?: number;
  variety?: number;
  recentLocations?: string[];
  blockedLocations?: string[];
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
  llm?: LlmRequestOptions;
};

export type TopicGenerateResult = {
  topics: string[];
  provider: 'llm' | 'template';
  seedTopic: string | null;
  count: number;
};
