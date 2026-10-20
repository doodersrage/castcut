import { chatCompletion, isLlmEnabled, type LlmEndpointOverride } from '../llm/client';
import { buildModelClarityAddendum, type ComfyImageModel } from '../comfy-models';
import { getDetailLimits, type DetailLevel } from './detail-level';
import { promptHasSceneDensity } from './shape';
import { stripPromptArtifacts } from './cleanup';

export function needsSparsePromptExpand(
  text: string,
  detail: DetailLevel,
  model: ComfyImageModel
): boolean {
  const { minChars } = getDetailLimits(detail, model);
  if (!minChars) {
    return false;
  }
  const trimmed = text.trim();
  if (!trimmed || trimmed.length >= minChars) {
    return false;
  }
  if (promptHasSceneDensity(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Ask the LLM for scene-specific densification instead of stock atmosphere beats.
 * Returns null when LLM is disabled or the rewrite is unusable.
 */
export async function expandSparsePromptWithLlm(input: {
  draft: string;
  hints: string;
  detail: DetailLevel;
  model: ComfyImageModel;
  endpoint?: LlmEndpointOverride;
  llmModel?: string;
}): Promise<string | null> {
  if (!isLlmEnabled() && !input.endpoint) {
    return null;
  }

  const { minChars, maxChars, maxSentences, maxTokens } = getDetailLimits(
    input.detail,
    input.model
  );
  if (!minChars) {
    return null;
  }

  const system = `You densify image prompts with scene-specific visual detail only.
${buildModelClarityAddendum(input.detail, input.model)}
Rules:
- Expand the draft using the user's hints. Add concrete garments, materials, colors, pose, props, and lighting that belong to THIS scene.
- Do NOT add generic quality tags, atmosphere boilerplate, or filler like "material weight grounds the image".
- Target at least ${minChars} characters and at most ${maxChars}. Prefer ${maxSentences} sentences or fewer.
- Output ONLY the rewritten prompt text.`;

  const user = `Hints: ${input.hints.trim() || '(none)'}

Sparse draft:
${input.draft.trim()}

Rewrite a denser, scene-specific prompt.`;

  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: Math.min(maxTokens, 512),
      temperature: 0.55,
      model: input.llmModel,
      endpoint: input.endpoint,
    });
    const cleaned = stripPromptArtifacts(content).trim();
    if (!cleaned || cleaned.length < input.draft.trim().length) {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}
