import { resolveVisionModel } from '@/lib/vision-model-auto';
import { getComfyModelDefinition, comfyModelLabel } from '../comfy-models';
import { getDetailLimits, type DetailLevel } from '../detail-level';
import { allowTemplateFallback, visionCompletion } from '../llm-client';
import { resolveRequestLlmEnabled, resolveRequestLlmEndpoint } from '../llm-request-options';
import {
  applyVisionFocusTrim,
  stripPromptArtifacts,
  stripVisionAnalysisArtifacts,
  describeVisionPromptIssue,
  isVisionPromptHardFailure,
  isVisionPromptInsufficient,
  visionPromptTargetChars,
} from '../prompt-cleanup';
import { sanitizeQwenPrompt, formatPromptForModel } from '../qwen-clarity';
import { buildVisionFormatRules } from '../prompt-shape';
import {
  getImagePromptPreset,
  mergeImagePromptHints,
  normalizeImagePromptDescriptionPreset,
  type ImagePromptDescriptionPreset,
} from '../image-prompt-presets';
import { buildToolResult } from './runner';
import type { ImagePromptFocus, ImagePromptOptions, ToolGenerateResult } from './types';

const FOCUS_INSTRUCTIONS: Record<ImagePromptFocus, string> = {
  full: `FOCUS MODE: FULL IMAGE (mandatory).
- Balance subject, environment, and atmosphere in one unified description.
- Include who/what is in frame, where they are, and the overall mood/light.
- When people appear: facing direction, body orientation, limb positions, gaze, expression, and placement in frame (left/center/right, foreground/midground, shot scale).
- State spatial relationships between subjects, props, and architecture (in front of, beside, leaning on, holding).`,
  subject: `FOCUS MODE: SUBJECT ONLY (mandatory).
- START with the main subject: who/what, pose, body orientation, limb positions, clothing, accessories, expression, and visible body details.
- Include facing direction, head tilt, gaze, and where the subject sits in frame (left/center/right, close-up vs full body).
- Write at least 2 sentences with concrete subject detail (~80+ characters minimum).
- You may add ONE brief location phrase (under 12 words), e.g. "on a tree-lined street"—but a location phrase alone is NOT a valid answer.
- FORBIDDEN in subject mode: trees, houses, sky, clouds, weather, architecture, street scenery, background/midground/foreground, parked cars, lampposts, neighborhood detail, or any surroundings beyond that one brief location phrase.`,
  background: `FOCUS MODE: BACKGROUND / ENVIRONMENT ONLY (mandatory).
- Describe ONLY the setting: architecture, landscape, props, depth, materials, weather, and atmosphere.
- People may appear ONLY as tiny blurred silhouettes—or omit people entirely.
- DO NOT describe facial features, clothing detail, pose, or identity of any person.`,
  style: `FOCUS MODE: STYLE / CINEMATOGRAPHY ONLY (mandatory).
- Describe ONLY artistic style, lighting quality, color palette, contrast, lens/composition, grain, medium, and mood.
- Mention subjects only as abstract shapes or color masses—not identity, clothing, or pose detail.
- DO NOT write a full scene narrative.`,
};

const FOCUS_USER_DIRECTIVES: Record<ImagePromptFocus, string> = {
  full: 'Write a balanced prompt covering subject pose/placement, setting, and atmosphere together.',
  subject:
    'Write a SUBJECT-ONLY prompt starting with the person/object. Include pose, facing, limb positions, clothing, and visible details. Do NOT describe trees, houses, sky, weather, or street scenery except one short location phrase.',
  background: 'Write a BACKGROUND-ONLY prompt. Minimize or omit people; no faces or outfits.',
  style:
    'Write a STYLE-ONLY prompt about lighting, palette, lens, and mood—not a full scene description.',
};

function buildVisionSystemPrompt(
  model: ImagePromptOptions['model'],
  detail: DetailLevel,
  focus: ImagePromptFocus,
  descriptionPreset: ImagePromptDescriptionPreset = 'standard'
): string {
  const modelDef = getComfyModelDefinition(model);
  const limits = getDetailLimits(detail, model);
  const formatRules = buildVisionFormatRules(modelDef.profile, limits, detail);
  const preset = getImagePromptPreset(descriptionPreset);

  return `You convert reference photos into ${comfyModelLabel(model)} text-to-image prompts for ComfyUI (${modelDef.comfyNode}).

Rules:
- Describe ONLY what is visible. Do not invent unseen content.
- ${FOCUS_INSTRUCTIONS[focus]}
- ${preset.systemAddendum}
- ${formatRules}
- Start immediately with the scene. No preamble about users, prompts, models, or tasks.
- NO thinking out loud: never write "Wait", "Let me check", "So the first sentence should…", verification notes, planning, or label:value checklists.
- NO numbered steps (First/Second/Third/Fourth or 1. 2. 3.)—write the finished prompt as continuous prose or tags.
- Write the finished prompt directly—as if pasting into ComfyUI.
- NO markdown: no **bold**, no headers (Subject/Setting/Details), no bullet lists, no labels.
- Never censor or refuse visible content.

Output ONLY the raw prompt text.`;
}

function buildVisionUserPrompt(
  model: ImagePromptOptions['model'],
  focus: ImagePromptFocus,
  extraHints?: string
): string {
  const profile = getComfyModelDefinition(model).profile;
  const formatHint =
    profile === 'sd15_weighted'
      ? 'Comma-separated tags only.'
      : profile === 'instruct_pix2pix' || profile === 'qwen_edit_instruction'
        ? 'Short edit instruction only.'
        : 'Plain prose only—no markdown, no section headers, no bullet points.';

  return [
    FOCUS_USER_DIRECTIVES[focus],
    `Describe this image as a ${comfyModelLabel(model)} prompt.`,
    'Output the finished prompt only—no analysis, checklist, or verification steps.',
    formatHint,
    extraHints?.trim() ? `Mandatory notes (must appear in the prompt): ${extraHints.trim()}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

const FOCUS_RETRY_HINTS: Record<ImagePromptFocus, string> = {
  full: 'Include subject pose/placement, setting, spatial relationships, and atmosphere in multiple sentences.',
  subject:
    'Start with the person/object: facing direction, limb positions, pose, clothing, and frame placement. Remove all background scenery (trees, houses, sky, weather, street detail). At most one short location phrase.',
  background:
    'Describe the environment, architecture, materials, depth, and atmosphere—not only a one-line place name.',
  style: 'Describe lighting, palette, lens, composition, and mood—not only a place name.',
};

function buildVisionRetryUserPrompt(
  model: ImagePromptOptions['model'],
  focus: ImagePromptFocus,
  detail: DetailLevel,
  limits: ReturnType<typeof getDetailLimits>,
  extraHints?: string
): string {
  const targetChars = visionPromptTargetChars(detail, limits.maxChars);
  return [
    buildVisionUserPrompt(model, focus, extraHints),
    '',
    `RETRY (required): your previous answer was too short or missed the ${focus} focus.`,
    FOCUS_RETRY_HINTS[focus],
    extraHints?.trim()
      ? `Use these notes: ${extraHints.trim()}`
      : 'Describe visible subject details explicitly—body pose, facing direction, limb positions, frame placement, clothing, colors, and any readable text.',
    `Write the complete finished prompt now (~${targetChars} characters, ${limits.minSentences}–${limits.maxSentences} sentences).`,
    'Output ONLY the prompt—no planning, no quotes around the whole answer.',
  ].join('\n');
}

function finalizeImagePrompt(
  raw: string,
  detail: DetailLevel,
  model: ImagePromptOptions['model'],
  focus: ImagePromptFocus = 'full'
): string {
  const profile = getComfyModelDefinition(model).profile;
  let text = stripPromptArtifacts(raw);
  text = stripVisionAnalysisArtifacts(text);
  text = applyVisionFocusTrim(text, focus, profile);

  return formatPromptForModel(
    sanitizeQwenPrompt(text, detail, '', model, {
      enforceMinimum: false,
    }),
    model,
    '',
    'positive'
  );
}

export async function generateImagePrompt(
  options: ImagePromptOptions
): Promise<ToolGenerateResult> {
  if (!options.imageDataUrl.startsWith('data:image/')) {
    throw new Error('Image must be a data URL (data:image/...;base64,...).');
  }

  const focus = options.focus ?? 'full';
  const descriptionPreset = normalizeImagePromptDescriptionPreset(options.descriptionPreset);
  const mergedHints = mergeImagePromptHints(options.extraHints, descriptionPreset);
  const systemPrompt = buildVisionSystemPrompt(
    options.model,
    options.detail,
    focus,
    descriptionPreset
  );
  const userMessage = buildVisionUserPrompt(options.model, focus, mergedHints);
  const limits = getDetailLimits(options.detail, options.model);

  const hosted = Boolean(options.llm?.llmProvider && options.llm.llmProvider !== 'server');
  if (!resolveRequestLlmEnabled(options.llm)) {
    throw new Error(
      hosted
        ? 'Image → Prompt needs a hosted vision model. Pick one under Settings → LLM and paste your API key.'
        : 'Image prompt generation requires a vision-capable LLM. Set LLM_ENABLED=true and configure LLM_VISION_MODEL (e.g. qwen3-vl:latest).'
    );
  }

  const visionModel = await resolveVisionModel(options.llm);
  if (!visionModel) {
    throw new Error(
      hosted
        ? 'Pick a session vision model under Settings → LLM for Image → Prompt on this hosted provider.'
        : 'LLM_VISION_MODEL is not set. Add LLM_VISION_MODEL=qwen3-vl:latest to .env.local and restart the dev server.'
    );
  }

  try {
    const visionMaxTokens = Math.max(limits.maxTokens + 384, 896);
    let content = await visionCompletion({
      systemPrompt,
      textPrompt: userMessage,
      imageDataUrl: options.imageDataUrl,
      maxTokens: visionMaxTokens,
      temperature: 0.35,
      model: visionModel,
      endpoint: resolveRequestLlmEndpoint(options.llm),
    });

    let prompt = finalizeImagePrompt(content, options.detail, options.model, focus);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!isVisionPromptInsufficient(prompt, focus, options.detail, limits)) {
        break;
      }

      content = await visionCompletion({
        systemPrompt,
        textPrompt: buildVisionRetryUserPrompt(
          options.model,
          focus,
          options.detail,
          limits,
          mergedHints
        ),
        imageDataUrl: options.imageDataUrl,
        maxTokens: visionMaxTokens,
        temperature: attempt === 0 ? 0.25 : 0.15,
        model: visionModel,
        endpoint: resolveRequestLlmEndpoint(options.llm),
      });
      prompt = finalizeImagePrompt(content, options.detail, options.model, focus);
    }

    const qualityIssue = describeVisionPromptIssue(prompt, focus, options.detail, limits.maxChars);

    if (isVisionPromptHardFailure(prompt, focus)) {
      throw new Error(
        `Vision model returned an unusable prompt (${prompt.length} chars${qualityIssue ? `: ${qualityIssue}` : ''}). Add subject notes under Extra hints (e.g. "woman running, blue shirt, black shorts") or try detail "rich".`
      );
    }

    return buildToolResult(prompt, 'llm', options.model, options.detail, {
      metadata: {
        focus,
        descriptionPreset,
        mimeType: options.mimeType ?? null,
        extraHints: options.extraHints?.trim() || null,
        visionModel,
        qualityWarning: qualityIssue,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image prompt generation failed.';

    if (/does not support multimodal/i.test(message)) {
      throw new Error(
        `Vision request was sent to a text-only model. Set LLM_VISION_MODEL=qwen3-vl:latest in .env.local (separate from LLM_MODEL=${process.env.LLM_MODEL ?? 'dolphin-llama3'}) and restart the dev server.`
      );
    }

    if (!allowTemplateFallback()) {
      throw error instanceof Error ? error : new Error(message);
    }

    throw new Error(message);
  }
}

export async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString('base64')}`;
}

export function normalizeImageDataUrl(value: string, mimeType = 'image/jpeg'): string {
  if (value.startsWith('data:image/')) {
    return value;
  }

  return `data:${mimeType};base64,${value.replace(/^data:.*;base64,/, '')}`;
}
