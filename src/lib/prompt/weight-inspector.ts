import { getComfyModelDefinition, type ComfyImageModel } from '../comfy-models/client';
import { modelUsesTagAssist } from './tag-assist';

export type WeightToken = {
  text: string;
  weight: number;
  raw: string;
};

export type PromptWeightInspection = {
  supportsWeights: boolean;
  estimatedTokens: number;
  tokenLimit: number;
  overLimit: boolean;
  weightedTokens: WeightToken[];
  suggestions: string[];
};

const WEIGHT_PATTERN = /(\([^)]+:\d+(?:\.\d+)?\)|\[[^\]]+:\d+(?:\.\d+)?\])/g;
const INNER_WEIGHT = /^(.+?):(\d+(?:\.\d+)?)$/;

function estimateClipTokens(text: string): number {
  return text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean).length;
}

export function inspectPromptWeights(
  prompt: string,
  model: ComfyImageModel | string
): PromptWeightInspection {
  const definition = getComfyModelDefinition(model);
  const supportsWeights = modelUsesTagAssist(model as ComfyImageModel);
  const tokenLimit = definition.referenceTokenLimit;
  const estimatedTokens = estimateClipTokens(prompt);
  const weightedTokens: WeightToken[] = [];

  for (const match of prompt.matchAll(WEIGHT_PATTERN)) {
    const raw = match[0];
    const inner = raw.slice(1, -1);
    const parsed = INNER_WEIGHT.exec(inner);
    if (!parsed) continue;
    weightedTokens.push({
      text: parsed[1].trim(),
      weight: Number(parsed[2]),
      raw,
    });
  }

  const suggestions: string[] = [];
  if (estimatedTokens > tokenLimit) {
    suggestions.push(
      `Estimated ${estimatedTokens} tokens exceeds ${tokenLimit} for ${definition.label}. Compact or de-emphasize tags.`
    );
  }
  if (supportsWeights && weightedTokens.length === 0 && prompt.includes(',')) {
    suggestions.push(
      'Select important tags and wrap with (tag:1.2) emphasis for SD-weighted models.'
    );
  }
  for (const token of weightedTokens) {
    if (token.weight > 1.6) {
      suggestions.push(
        `High weight on “${token.text}” (${token.weight}) may overpower the prompt.`
      );
    }
  }

  return {
    supportsWeights,
    estimatedTokens,
    tokenLimit,
    overLimit: estimatedTokens > tokenLimit,
    weightedTokens,
    suggestions,
  };
}
