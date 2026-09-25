import { resolveVisionModel } from '@/lib/vision-model-auto';
import { comfyModelLabel, DEFAULT_QWEN_MODEL } from './comfy-models';
import { getDetailLimits, type DetailLevel } from './detail-level';
import { visionCompletion } from './llm-client';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from './llm-request-options';
import { stripPromptArtifacts } from './prompt-cleanup';
import type { ComfyImageModel } from './comfy-models/client';

export const STILL_SCAN_PURPOSES = [
  'inpaint',
  'outpaint',
  'compose',
  'controlnet',
  'roleplay-photo',
  'fitting-garment',
] as const;

export type StillScanPurpose = (typeof STILL_SCAN_PURPOSES)[number];

export type StillScan = {
  prompt: string;
};

const PURPOSE_PROMPTS: Record<StillScanPurpose, { system: string; user: string }> = {
  inpaint: {
    system: `You read a still that will be inpainted.
Return ONLY JSON: {"prompt":""}
- prompt: a short edit instruction for the masked region — what should appear there, matching lighting and materials already visible.
- Stay faithful to the still. Do not invent a new scene.
- No markdown, no commentary.`,
    user: 'Write the inpaint change description for this still.',
  },
  outpaint: {
    system: `You read a still that will be outpainted (canvas expanded).
Return ONLY JSON: {"prompt":""}
- prompt: one or two sentences of the visible scene so a new border can continue it — setting, lighting, weather, era.
- Do not invent unseen landmarks. No markdown, no commentary.`,
    user: 'Describe this still so the new border can continue the scene.',
  },
  compose: {
    system: `You read Image 1 for a Compose instruction.
Return ONLY JSON: {"prompt":""}
- prompt: a short keep/replace command naming the visible subject and a plausible scene or wardrobe change.
- Example shape: "Keep the person. Replace the background with …"
- Stay faithful to who is visible. No markdown, no commentary.`,
    user: 'Write a Compose instruction from this Image 1 still.',
  },
  controlnet: {
    system: `You read a still that will condition ControlNet (pose, depth, canny, or lineart).
Return ONLY JSON: {"prompt":""}
- prompt: the subject structure — pose, silhouette, camera height, important edges. Not a full scene essay.
- Stay faithful to the still. No markdown, no commentary.`,
    user: 'Describe the subject structure in this ControlNet reference.',
  },
  'roleplay-photo': {
    system: `You read a selfie or plate that will lock identity for Roleplay From photo.
Return ONLY JSON: {"prompt":""}
- prompt: visible look only — hair, face, body, current clothes. This becomes character notes, not a new identity.
- Do not invent a name, job, or backstory. No markdown, no commentary.`,
    user: 'Describe the visible look in this reference photo.',
  },
  'fitting-garment': {
    system: `You read an extracted clothing cutout, packshot, flat lay, product photo, or worn-garment still for Outfit try-on.
Return ONLY JSON: {"prompt":""}
- prompt: a dense fashion description of the garments only — silhouette, fit, colors, fabrics, patterns, layers, footwear, and accessories.
- Prefer what is visible on the clothing itself. Ignore face, body, pose, and background. Do not invent garments that are not visible.
- Prefer concrete nouns (blazer, chino, chelsea boot) over brand names. No markdown, no commentary.`,
    user: 'Describe the clothing in this extracted reference for an outfit try-on.',
  },
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

export function normalizeStillScanPurpose(value: unknown): StillScanPurpose | null {
  const id = String(value ?? '')
    .trim()
    .toLowerCase();
  return STILL_SCAN_PURPOSES.find(purpose => purpose === id) ?? null;
}

export function parseStillScan(raw: string, maxChars = 1200): StillScan {
  const cleaned = stripPromptArtifacts(raw).trim();
  const json = extractJsonObject(cleaned);
  const fromJson =
    typeof json?.prompt === 'string'
      ? json.prompt
      : typeof json?.currentPrompt === 'string'
        ? json.currentPrompt
        : typeof json?.description === 'string'
          ? json.description
          : typeof json?.look === 'string'
            ? json.look
            : '';
  const prose = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  return { prompt: clipScanField(fromJson.trim() || prose, maxChars) };
}

export async function scanStillReference(options: {
  purpose: StillScanPurpose;
  imageDataUrl: string;
  model?: ComfyImageModel;
  detail?: DetailLevel;
  extraHints?: string;
  llm?: LlmRequestOptions;
}): Promise<StillScan> {
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

  const model = options.model ?? DEFAULT_QWEN_MODEL;
  const limits = getDetailLimits(options.detail ?? 'balanced', model);
  const spec = PURPOSE_PROMPTS[options.purpose];
  const intent = options.extraHints?.trim() ?? '';

  const content = await visionCompletion({
    systemPrompt: `${spec.system}
Target: ${comfyModelLabel(model)}.
- ${limits.maxSentences} sentences max, ~${limits.maxChars} characters.`,
    textPrompt: [spec.user, intent ? `User notes: ${intent}` : ''].filter(Boolean).join('\n'),
    imageDataUrl: options.imageDataUrl,
    maxTokens: Math.max(limits.maxTokens, 280),
    temperature: 0.35,
    model: visionModel,
    endpoint: resolveRequestLlmEndpoint(options.llm),
    usageContext: { route: `vision-scan-${options.purpose}` },
  });

  const scanned = parseStillScan(content, limits.maxChars);
  if (!scanned.prompt.trim()) {
    throw new Error('Vision scan returned an empty prompt. Try a clearer still.');
  }
  return scanned;
}
