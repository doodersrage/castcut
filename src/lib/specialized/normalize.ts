import { normalizeComfyModel } from '../comfy-models';
import { normalizeDetailLevel, type DetailLevel } from '../prompt/detail-level';
import { parseLlmRequestOptions } from '../llm/request-options';
import type { SharedGenerationOptions } from './types';

export function normalizeSharedGenerationOptions(
  body?: Partial<{
    model?: string;
    detail?: string | DetailLevel;
    llmTemperature?: number;
    allowTemplateFallback?: boolean;
    llmModel?: string;
    llmVisionModel?: string;
    llmEnabled?: boolean;
    llmProvider?: string;
    llmApiKey?: string;
  }> | null
): SharedGenerationOptions {
  return {
    model: normalizeComfyModel(body?.model),
    detail: normalizeDetailLevel(body?.detail),
    llm: parseLlmRequestOptions(body),
  };
}

export function normalizeRecentLocations(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const locations = raw
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 24);

  return locations.length > 0 ? locations : undefined;
}

export function normalizeRecentClothing(raw: unknown): string[] | undefined {
  return normalizeRecentLocations(raw);
}

export function normalizeBlockedLocations(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const locations = raw
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 200);

  return locations.length > 0 ? locations : undefined;
}

export function normalizeLockedWardrobeId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeLockedLocation(raw: unknown): string | undefined {
  return normalizeLockedWardrobeId(raw);
}

export function normalizeVariationSeed(raw: unknown): string | undefined {
  return normalizeLockedWardrobeId(raw);
}
