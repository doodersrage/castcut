import type { DetailLevel } from './detail-level';
import { getDetailLimits, normalizeDetailLevel } from './detail-level';
import { sanitizeQwenPrompt } from './qwen-clarity';
import { chatCompletion } from './llm-client';
import { isThinkingOnlyArtifact, stripPromptArtifacts } from './prompt-cleanup';
import {
  buildModelClarityAddendum,
  buildModelSystemPrompt,
  formatPromptForModel,
  fluxIgnoresNegative,
  getComfyModelDefinition,
  normalizeComfyModel,
  type ComfyImageModel,
} from './comfy-models';
import { enforcePromptShapeForProfile } from './prompt-shape';
import { hasDistinctPeopleStructure } from './distinct-people';

export type FormatMode = 'positive' | 'negative';

export type FormatSettings = {
  model: ComfyImageModel;
  detail: DetailLevel;
  mode: FormatMode;
  smartFormat: boolean;
};

export type FormatResult = {
  prompt: string;
  mode: FormatMode;
  model: ComfyImageModel;
  comfyNode: string;
  provider: 'llm' | 'rules';
  limits: {
    minChars?: number;
    maxChars: number;
    maxSentences: number;
    maxTokens: number;
  };
  inputChars: number;
  outputChars: number;
  /** Pre-optimize LLM/rules draft before sanitize/format. */
  rawPrompt?: string;
};

const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  model: 'qwen-image-2512',
  detail: 'balanced',
  mode: 'positive',
  smartFormat: true,
};

export function normalizeFormatSettings(
  value?:
    | (Partial<Omit<FormatSettings, 'model' | 'detail'>> & {
        model?: string | ComfyImageModel;
        detail?: string | DetailLevel;
      })
    | null
): FormatSettings {
  return {
    model: normalizeComfyModel(value?.model),
    detail: normalizeDetailLevel(value?.detail),
    mode: value?.mode === 'negative' ? 'negative' : 'positive',
    smartFormat:
      typeof value?.smartFormat === 'boolean'
        ? value.smartFormat
        : DEFAULT_FORMAT_SETTINGS.smartFormat,
  };
}

function cleanDraft(raw: string): string {
  return stripPromptArtifacts(raw);
}

function applyModelStructure(text: string, settings: FormatSettings, input: string): string {
  const profile = getComfyModelDefinition(settings.model).profile;
  return enforcePromptShapeForProfile(text, profile, settings.mode, input);
}

function shouldBalanceDistinctPeople(input: string, draft: string, mode: FormatMode): boolean {
  if (mode !== 'positive') {
    return false;
  }

  return hasDistinctPeopleStructure(input) || hasDistinctPeopleStructure(draft);
}

function finalizeFormattedPrompt(raw: string, input: string, settings: FormatSettings): string {
  const cleaned = applyModelStructure(cleanDraft(raw), settings, input);
  const distinctPeople = shouldBalanceDistinctPeople(input, cleaned, settings.mode);
  const sanitized = sanitizeQwenPrompt(cleaned, settings.detail, input, settings.model, {
    enforceMinimum: false,
    distinctPeople,
  });
  return formatPromptForModel(sanitized, settings.model, input, settings.mode);
}

async function formatWithLlm(input: string, settings: FormatSettings): Promise<string> {
  const modelDef = getComfyModelDefinition(settings.model);

  const fluxNegativeNote =
    settings.mode === 'negative' && fluxIgnoresNegative(modelDef.profile)
      ? 'FLUX ignores negatives—phrase positively what must stay unchanged.'
      : '';

  const systemPrompt = `${buildModelSystemPrompt(settings.model, settings.mode)}

You are adapting an EXISTING prompt draft for ${modelDef.label} (${modelDef.comfyNode}).
- Preserve the user's subjects, actions, mood, and key details—do not invent unrelated content.
- Rewrite structure and phrasing to match the target model's format.
- Remove tag soup, labels, markdown, and meta commentary.
- Never prefix output with model names or phrases like "the prompt adapted for…"—start directly with the prompt prose.
- ${fluxNegativeNote}
${buildModelClarityAddendum(settings.detail, settings.model)}

Output ONLY the formatted prompt text. No quotes around the whole prompt, labels, numbered analysis, thinking steps, or explanations.`;

  const userMessage = `Adapt this draft for ${modelDef.label}. Preserve all subjects and details. Output only the rewritten prompt.

---
${input}
---`;

  const content = await chatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.4,
    maxTokens: getDetailLimits(settings.detail, settings.model).maxTokens,
    extraBody: { top_p: 0.9 },
  });

  const cleaned = stripPromptArtifacts(content);
  if (!cleaned.trim() || isThinkingOnlyArtifact(cleaned)) {
    throw new Error('LLM returned reasoning text instead of a prompt.');
  }

  return cleaned;
}

function formatWithRules(input: string, settings: FormatSettings): string {
  return finalizeFormattedPrompt(cleanDraft(input), input, settings);
}

function buildFormatResult(
  prompt: string,
  input: string,
  settings: FormatSettings,
  provider: FormatResult['provider'],
  rawPrompt?: string
): FormatResult {
  const limits = getDetailLimits(settings.detail, settings.model);
  const modelDef = getComfyModelDefinition(settings.model);

  return {
    prompt,
    mode: settings.mode,
    model: settings.model,
    comfyNode: modelDef.comfyNode,
    provider,
    limits: {
      minChars: limits.minChars,
      maxChars: limits.maxChars,
      maxSentences: limits.maxSentences,
      maxTokens: limits.maxTokens,
    },
    inputChars: input.length,
    outputChars: prompt.length,
    rawPrompt: rawPrompt?.trim() || undefined,
  };
}

export async function formatPrompt(
  input: string,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS
): Promise<FormatResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Input cannot be empty.');
  }

  const normalized = normalizeFormatSettings(settings);
  const llmEnabled = process.env.LLM_ENABLED !== 'false';
  const useLlm = normalized.smartFormat && llmEnabled;

  if (useLlm) {
    try {
      const llmOutput = await formatWithLlm(trimmed, normalized);
      const rawPrompt = cleanDraft(llmOutput).trim() || llmOutput.trim();
      const prompt = finalizeFormattedPrompt(llmOutput, trimmed, normalized);
      return buildFormatResult(prompt, trimmed, normalized, 'llm', rawPrompt);
    } catch (error) {
      const fallbackAllowed = process.env.ALLOW_TEMPLATE_FALLBACK !== 'false';
      if (!fallbackAllowed) {
        throw error instanceof Error ? error : new Error('Formatting failed.');
      }
      console.warn(
        '[prompt-formatter] LLM failed, using rules fallback:',
        error instanceof Error ? error.message : error
      );
    }
  }

  const prompt = formatWithRules(trimmed, normalized);
  return buildFormatResult(prompt, trimmed, normalized, 'rules');
}
