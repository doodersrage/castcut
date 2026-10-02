import {
  buildModelClarityAddendum,
  buildModelSystemPrompt,
  getComfyModelDefinition,
  type ComfyImageModel,
} from '../comfy-models';
import { getDetailLimits } from '../detail-level';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  resolveRequestTemplateFallback,
  resolveRequestTemperature,
} from '../llm-request-options';
import { chatCompletion } from '../llm-client';
import { isThinkingOnlyArtifact, stripPromptArtifacts } from '../prompt-cleanup';
import { ensureSinglePersonPrompt } from '../single-person';
import {
  sanitizeQwenPrompt,
  formatPromptForModel,
  trimPromptToMaxChars,
  compactPromptForProfile,
} from '../qwen-clarity';
import { expandSparsePromptWithLlm, needsSparsePromptExpand } from '../sparse-prompt-expand';
import { withRawPrompt } from '../raw-prompt';
import type { DetailLevel } from '../detail-level';
import type { ToolGenerateResult, ToolLimits } from './types';

export function buildToolResult(
  prompt: string,
  provider: ToolGenerateResult['provider'],
  model: ComfyImageModel,
  detail: DetailLevel,
  extras?: Partial<ToolGenerateResult>
): ToolGenerateResult {
  const limits = getDetailLimits(detail, model);
  const modelDef = getComfyModelDefinition(model);

  return {
    prompt,
    provider,
    model,
    comfyNode: modelDef.comfyNode,
    limits: {
      minChars: limits.minChars,
      maxChars: limits.maxChars,
      maxSentences: limits.maxSentences,
      maxTokens: limits.maxTokens,
    },
    ...extras,
  };
}

export async function runSpecializedPrompt(options: {
  model: ComfyImageModel;
  detail: DetailLevel;
  toolInstructions: string;
  userMessage: string;
  templateFallback: () => string | Promise<string>;
  /**
   * Context for sanitize/pad/sparse-expand. Must be user hints only — never
   * rolled location/wardrobe ingredient seeds (those leak into the optimized prompt).
   */
  sanitizeInput?: string;
  temperature?: number;
  allowTemplateFallback?: boolean;
  /** Text model override for this request (falls back to server LLM_MODEL). */
  llmModel?: string;
  /** false = template-only for this request/browser; undefined = server LLM_ENABLED default. */
  llmEnabled?: boolean;
  llmProvider?: import('../llm-providers').SessionLlmProvider;
  llmApiKey?: string;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
  seed?: string;
  soloSubject?: boolean;
  enforceMinimum?: boolean;
  postProcessPrompt?: (prompt: string) => string;
  /**
   * LLM path only: reshape the cleaned reply before sanitize trims it to the model's sentence
   * and char limits (e.g. drop the alternate takes a rambling writer appends).
   */
  preProcessPrompt?: (prompt: string) => string;
  /** When set, report this model in the result (e.g. selected edit checkpoint). */
  resultModel?: ComfyImageModel;
}): Promise<ToolGenerateResult> {
  const limits = getDetailLimits(options.detail, options.model);
  const maxTokens = options.maxTokens ?? limits.maxTokens;
  const reportedModel = options.resultModel ?? options.model;
  const systemPrompt = `${buildModelSystemPrompt(options.model, 'positive')}

${options.toolInstructions}

${buildModelClarityAddendum(options.detail, options.model)}

Output ONLY the raw prompt text. No quotes around the whole prompt, labels, markdown, numbered analysis, thinking steps, or explanations.`;

  if (
    resolveRequestLlmEnabled({
      llmEnabled: options.llmEnabled,
      llmProvider: options.llmProvider,
    })
  ) {
    try {
      const content = await chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: options.userMessage },
        ],
        maxTokens,
        temperature: resolveRequestTemperature({ temperature: options.temperature }),
        model: options.llmModel,
        endpoint: resolveRequestLlmEndpoint({
          llmProvider: options.llmProvider,
          llmApiKey: options.llmApiKey,
        }),
      });

      const rawPrompt = stripPromptArtifacts(content).trim() || content.trim();
      const draft = options.preProcessPrompt?.(rawPrompt).trim() || content;
      const prompt = await finalizeSpecializedPrompt(
        draft,
        options.detail,
        options.model,
        options.sanitizeInput ?? '',
        options.soloSubject,
        options.enforceMinimum,
        options.postProcessPrompt,
        true,
        {
          llmProvider: options.llmProvider,
          llmApiKey: options.llmApiKey,
          llmModel: options.llmModel,
        }
      );

      return buildToolResult(prompt, 'llm', reportedModel, options.detail, {
        seed: options.seed,
        metadata: withRawPrompt(options.metadata, rawPrompt),
      });
    } catch (error) {
      if (
        !resolveRequestTemplateFallback({ allowTemplateFallback: options.allowTemplateFallback })
      ) {
        throw error instanceof Error ? error : new Error('Generation failed.');
      }
      console.warn(
        '[specialized-generator] LLM failed, using template fallback:',
        error instanceof Error ? error.message : error
      );
    }
  }

  const templateDraft = await Promise.resolve(options.templateFallback());
  const rawPrompt = stripPromptArtifacts(templateDraft).trim() || templateDraft.trim();
  const prompt = await finalizeSpecializedPrompt(
    templateDraft,
    options.detail,
    options.model,
    options.sanitizeInput ?? '',
    options.soloSubject,
    options.enforceMinimum,
    options.postProcessPrompt,
    false,
    undefined,
    // The app's own template text, not model output: nothing in it is "reasoning".
    false
  );

  return buildToolResult(prompt, 'template', reportedModel, options.detail, {
    seed: options.seed,
    metadata: withRawPrompt(options.metadata, rawPrompt),
  });
}

async function finalizeSpecializedPrompt(
  raw: string,
  detail: DetailLevel,
  model: ComfyImageModel,
  input: string,
  soloSubject = false,
  enforceMinimum = true,
  postProcessPrompt?: (prompt: string) => string,
  allowSparseLlmExpand = false,
  llm?: {
    llmProvider?: import('../llm-providers').SessionLlmProvider;
    llmApiKey?: string;
    llmModel?: string;
  },
  /**
   * False for a template draft. The reasoning check is for model output: it took the labelled
   * lines of Story's adult "Oral interruption" template ("ORAL: …", "FOREGROUND: …") for a
   * model's checklist, and with no language model that still could not be written.
   */
  fromModel = true
): Promise<string> {
  const cleaned = stripPromptArtifacts(raw);
  if (!cleaned.trim() || (fromModel && isThinkingOnlyArtifact(cleaned))) {
    throw new Error('LLM returned reasoning text instead of a prompt.');
  }

  let source = cleaned;
  if (enforceMinimum && allowSparseLlmExpand) {
    const preview = sanitizeQwenPrompt(cleaned, detail, input, model, {
      soloSubject,
      enforceMinimum: false,
    });
    if (needsSparsePromptExpand(preview, detail, model)) {
      const expanded = await expandSparsePromptWithLlm({
        draft: preview,
        hints: input,
        detail,
        model,
        endpoint: resolveRequestLlmEndpoint(llm),
        llmModel: llm?.llmModel,
      });
      if (expanded) {
        source = expanded;
      }
    }
  }

  let prompt = sanitizeQwenPrompt(source, detail, input, model, {
    soloSubject,
    enforceMinimum,
  });

  if (postProcessPrompt) {
    prompt = postProcessPrompt(prompt);
  }

  const profile = getComfyModelDefinition(model).profile;
  prompt = compactPromptForProfile(prompt, profile);

  const { maxChars } = getDetailLimits(detail, model);
  if (prompt.length > maxChars) {
    prompt = trimPromptToMaxChars(prompt, maxChars);
  }

  if (soloSubject) {
    prompt = ensureSinglePersonPrompt(prompt, getComfyModelDefinition(model).profile);
  }

  return formatPromptForModel(prompt, model, input, 'positive');
}

export function richDetailLimits(model: ComfyImageModel): ToolLimits {
  return getDetailLimits('rich', model);
}
