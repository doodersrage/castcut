import { resolveVisionModel } from '@/lib/vision-model-auto';
import { getComfyModelDefinition, comfyModelLabel } from './comfy-models';
import { getDetailLimits } from './detail-level';
import { visionCompletion } from './llm-client';
import { resolveRequestLlmEnabled, resolveRequestLlmEndpoint } from './llm-request-options';
import { stripPromptArtifacts } from './prompt-cleanup';
import { formatPromptForModel, sanitizeQwenPrompt } from './qwen-clarity';
import { buildToolResult } from './specialized/runner';
import type { ImagePromptOptions, ToolGenerateResult } from './specialized/types';
import { enrichGenerateResult } from './generation-diagnostics';

export type RefinePromptOptions = Pick<
  ImagePromptOptions,
  'model' | 'detail' | 'imageDataUrl' | 'mimeType' | 'llm'
> & {
  currentPrompt?: string;
  intentHints?: string;
};

export type RefineScan = {
  currentPrompt: string;
};

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? trimmed).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clipScanField(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

async function requireVisionScanReady(options: Pick<RefinePromptOptions, 'llm'>): Promise<string> {
  const hosted = Boolean(options.llm?.llmProvider && options.llm.llmProvider !== 'server');
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error(
      hosted
        ? 'Vision scan needs a hosted vision model. Pick one under Settings → LLM and paste your API key.'
        : 'Vision scan needs a vision-capable LLM. Set LLM_ENABLED=true and configure LLM_VISION_MODEL.'
    );
  }
  const visionModel = await resolveVisionModel(options.llm);
  if (!visionModel) {
    throw new Error(
      hosted
        ? 'Pick a session vision model under Settings → LLM to scan this still.'
        : 'No vision model found on the LLM server. Pull one (e.g. qwen2.5vl or gemma3) or set LLM_VISION_MODEL in .env.local and restart.'
    );
  }
  return visionModel;
}

/** Parse a vision reply into the Refine Current prompt field. */
export function parseRefineScan(raw: string, maxChars = 1200): RefineScan {
  const cleaned = stripPromptArtifacts(raw).trim();
  const json = extractJsonObject(cleaned);
  const fromJson =
    typeof json?.currentPrompt === 'string'
      ? json.currentPrompt
      : typeof json?.prompt === 'string'
        ? json.prompt
        : typeof json?.description === 'string'
          ? json.description
          : '';
  const prose = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const source = fromJson.trim() || prose;
  return {
    currentPrompt: clipScanField(source, maxChars),
  };
}

export async function scanRefineReference(
  options: Pick<RefinePromptOptions, 'imageDataUrl' | 'model' | 'detail' | 'intentHints' | 'llm'>
): Promise<RefineScan> {
  const visionModel = await requireVisionScanReady(options);
  const limits = getDetailLimits(options.detail, options.model);
  const intent = options.intentHints?.trim() ?? '';

  const content = await visionCompletion({
    systemPrompt: `You read a still that will be the reference for a ComfyUI refine (${comfyModelLabel(options.model)}).
Return ONLY JSON: {"currentPrompt":""}
- currentPrompt: a finished image prompt describing who/what is visible — pose, clothes, setting, lighting.
- Stay faithful to the still. Do not invent unseen people, places, or props.
- ${limits.maxSentences} sentences max, ~${limits.maxChars} characters.
- No markdown, no commentary.`,
    textPrompt: [
      'Describe this reference still as a Current prompt draft.',
      intent ? `User intent (optional, do not treat as already visible): ${intent}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    imageDataUrl: options.imageDataUrl,
    maxTokens: Math.max(limits.maxTokens, 280),
    temperature: 0.35,
    model: visionModel,
    endpoint: resolveRequestLlmEndpoint(options.llm),
    usageContext: { route: 'refine-scan' },
  });

  const scanned = parseRefineScan(content, limits.maxChars);
  if (!scanned.currentPrompt.trim()) {
    throw new Error('Vision scan returned an empty prompt. Try a clearer still.');
  }
  return scanned;
}

export async function refineImagePrompt(
  options: RefinePromptOptions
): Promise<
  ToolGenerateResult & { diagnostics: ReturnType<typeof enrichGenerateResult>['diagnostics'] }
> {
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error('Image refine requires LLM_ENABLED=true.');
  }

  const visionModel = await resolveVisionModel(options.llm);
  if (!visionModel) {
    throw new Error('LLM_VISION_MODEL is not set.');
  }

  const modelDef = getComfyModelDefinition(options.model);
  const limits = getDetailLimits(options.detail, options.model);
  const intent = options.intentHints?.trim() ?? '';
  const current = options.currentPrompt?.trim() ?? '';

  const systemPrompt = `You refine ${comfyModelLabel(options.model)} image prompts for ComfyUI (${modelDef.comfyNode}).

Compare the reference image to the user's intent and any existing prompt draft.
Output ONE improved prompt that better matches what the user wanted while staying faithful to visible image content.

Rules:
- Fix sport/wardrobe mismatches (e.g. street clothes on cyclists, missing helmets).
- Preserve distinct left/right people when the intent describes a duo.
- ${limits.maxSentences} sentences max, ~${limits.maxChars} characters.
- Output ONLY the finished prompt—no analysis or markdown.`;

  const userMessage = [
    intent ? `User intent: ${intent}` : 'Infer intent from the image.',
    current ? `Current draft to improve:\n${current}` : null,
    'Rewrite the prompt to better match intent while describing visible content.',
  ]
    .filter(Boolean)
    .join('\n\n');

  let content: string;
  try {
    content = await visionCompletion({
      systemPrompt,
      textPrompt: userMessage,
      imageDataUrl: options.imageDataUrl,
      maxTokens: Math.max(limits.maxTokens + 256, 768),
      temperature: 0.35,
      model: visionModel,
      endpoint: resolveRequestLlmEndpoint(options.llm),
    });
  } catch (error) {
    if (error instanceof RangeError) {
      const site =
        error.stack
          ?.split('\n')
          .map(line => line.trim())
          .find(line => /prompt-cleanup|llm-client|image-refine|JSON|parse/i.test(line)) ??
        error.stack?.split('\n')[1]?.trim() ??
        'unknown';
      throw new Error(
        `Vision refine hit a call-stack limit while reading the model reply (${error.message} @ ${site}).`
      );
    }
    throw error;
  }

  let cleaned: string;
  try {
    cleaned = stripPromptArtifacts(content);
  } catch (error) {
    if (error instanceof RangeError) {
      // Fall back to a light cleanup so refine can still return a prompt.
      cleaned = content.replace(/\s+/g, ' ').trim();
    } else {
      throw error;
    }
  }

  const prompt = formatPromptForModel(
    sanitizeQwenPrompt(cleaned, options.detail, intent, options.model),
    options.model,
    intent,
    'positive'
  );

  const result = buildToolResult(prompt, 'llm', options.model, options.detail, {
    metadata: {
      refined: true,
      intentHints: intent || null,
      previousPrompt: current || null,
      visionModel,
    },
  });

  return enrichGenerateResult(result, intent || current);
}
