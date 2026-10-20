/**
 * Parsing, shape-normalizing, and placeholder-detection helpers for raw
 * ComfyUI API-format workflow JSON, plus custom-token normalization.
 *
 * Extracted from comfyui-config.ts (which re-exports all of these to keep
 * its public API unchanged) — this cluster only touches workflow JSON
 * shape and token-count bookkeeping, with no dependency on the queue
 * injection / sampler-patching logic that stayed behind.
 */

import {
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_CFG_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  type CustomWorkflowToken,
  type ComfyUiRuntimeConfig,
  type WorkflowPlaceholderTokens,
} from '../comfyui/config';
import {
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  DEFAULT_CHECKPOINT_TOKEN,
} from '../model-checkpoint-map';
import { LORA_PLACEHOLDER_TOKEN_PATTERN } from './lora-patch';

export function normalizeComfyApiWorkflow(value: Record<string, unknown>): Record<string, unknown> {
  if (listWorkflowNodeIds(value).length > 0) {
    return value;
  }

  for (const key of ['prompt', 'workflow', 'graph']) {
    const nested = value[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>;
      if (listWorkflowNodeIds(nestedRecord).length > 0) {
        return nestedRecord;
      }
    }
  }

  return value;
}

export function parseWorkflowJson(raw?: string): Record<string, unknown> | null {
  if (!raw?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeComfyApiWorkflow(parsed as Record<string, unknown>);
    }
  } catch {
    return null;
  }

  return null;
}

export function findUnresolvedLoaderPlaceholders(workflow: Record<string, unknown>): string[] {
  const unresolved = new Set<string>();
  const loaderTokens = [DEFAULT_UNET_TOKEN, DEFAULT_VAE_TOKEN, DEFAULT_CHECKPOINT_TOKEN];
  const loraTokenPattern = LORA_PLACEHOLDER_TOKEN_PATTERN;

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs) {
      continue;
    }
    for (const value of Object.values(inputs)) {
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      for (const token of loaderTokens) {
        if (trimmed.includes(token)) {
          unresolved.add(token);
        }
      }
      if (loraTokenPattern.test(trimmed)) {
        unresolved.add(trimmed);
      }
    }
  }

  return [...unresolved];
}

export function listWorkflowNodeIds(workflow: Record<string, unknown>): string[] {
  return Object.keys(workflow)
    .filter(key => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right));
}

export function countPlaceholders(raw: string, token: string): number {
  if (!token || !raw) {
    return 0;
  }

  let count = 0;
  let index = raw.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = raw.indexOf(token, index + token.length);
  }
  return count;
}

export function detectWorkflowPlaceholders(
  raw: string,
  tokens: Pick<WorkflowPlaceholderTokens, 'positive' | 'negative'> = {
    positive: DEFAULT_POSITIVE_TOKEN,
    negative: DEFAULT_NEGATIVE_TOKEN,
  }
): {
  positive: number;
  negative: number;
  seed: number;
  width: number;
  height: number;
  cfg: number;
  steps: number;
  sampler: number;
  scheduler: number;
  shift: number;
  fluxMaxShift: number;
  fluxBaseShift: number;
  denoise: number;
  inputImage: number;
  maskImage: number;
  initImage: number;
  videoFrames: number;
  videoFps: number;
} {
  return {
    positive: countPlaceholders(raw, tokens.positive),
    negative: countPlaceholders(raw, tokens.negative),
    seed: countPlaceholders(raw, DEFAULT_SEED_TOKEN),
    width: countPlaceholders(raw, DEFAULT_WIDTH_TOKEN),
    height: countPlaceholders(raw, DEFAULT_HEIGHT_TOKEN),
    cfg: countPlaceholders(raw, DEFAULT_CFG_TOKEN),
    steps: countPlaceholders(raw, DEFAULT_STEPS_TOKEN),
    sampler: countPlaceholders(raw, DEFAULT_SAMPLER_TOKEN),
    scheduler: countPlaceholders(raw, DEFAULT_SCHEDULER_TOKEN),
    shift: countPlaceholders(raw, DEFAULT_SHIFT_TOKEN),
    fluxMaxShift: countPlaceholders(raw, DEFAULT_FLUX_MAX_SHIFT_TOKEN),
    fluxBaseShift: countPlaceholders(raw, DEFAULT_FLUX_BASE_SHIFT_TOKEN),
    denoise: countPlaceholders(raw, DEFAULT_DENOISE_TOKEN),
    inputImage: countPlaceholders(raw, DEFAULT_INPUT_IMAGE_TOKEN),
    maskImage: countPlaceholders(raw, DEFAULT_MASK_IMAGE_TOKEN),
    initImage: countPlaceholders(raw, DEFAULT_INIT_IMAGE_TOKEN),
    videoFrames: countPlaceholders(raw, DEFAULT_VIDEO_FRAMES_TOKEN),
    videoFps: countPlaceholders(raw, DEFAULT_VIDEO_FPS_TOKEN),
  };
}

export function normalizeCustomWorkflowTokens(
  tokens?: CustomWorkflowToken[]
): CustomWorkflowToken[] {
  if (!tokens?.length) {
    return [];
  }

  return tokens
    .map(entry => ({
      token: entry.token?.trim() ?? '',
      value: entry.value?.trim() ?? '',
    }))
    .filter(entry => entry.token.length > 0 && entry.value.length > 0);
}

export function resolveCustomWorkflowTokens(runtime?: ComfyUiRuntimeConfig): CustomWorkflowToken[] {
  return normalizeCustomWorkflowTokens(runtime?.customTokens);
}

export function detectCustomWorkflowPlaceholders(
  raw: string,
  customTokens: CustomWorkflowToken[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of customTokens) {
    const count = countPlaceholders(raw, entry.token);
    if (count > 0) {
      counts[entry.token] = count;
    }
  }
  return counts;
}
