import { resolveVisionModel } from '@/lib/vision-model-auto';
import {
  chatCompletion,
  allowTemplateFallback,
  isLlmEnabled,
  visionCompletion,
} from './llm-client';
import { getComfyModelDefinition } from './comfy-models/client';
import { isWanLightningModel } from './model-sampling-patch';
import { isWanRapidAioModel } from './model-denoise-defaults';
import {
  resolveRequestLlmEnabled,
  resolveRequestLlmEndpoint,
  type LlmRequestOptions,
} from './llm-request-options';
import { stripPromptArtifacts } from './prompt-cleanup';

export type VideoPromptRequest = {
  subject: string;
  motion?: string;
  camera?: string;
  durationSec?: number;
  style?: string;
  model?: string;
  /** Force template composition even when LLM is enabled. */
  preferTemplate?: boolean;
};

function isWanCfg1DistilledModel(model?: string): boolean {
  return isWanLightningModel(model) || isWanRapidAioModel(model);
}

export function buildVideoPrompt(request: VideoPromptRequest): string {
  const subject = request.subject.trim();
  const motion = request.motion?.trim();
  const camera = request.camera?.trim();
  const style = request.style?.trim();
  const duration =
    typeof request.durationSec === 'number' && request.durationSec > 0
      ? `${request.durationSec}s clip`
      : 'short clip';
  const distilled = isWanCfg1DistilledModel(request.model);
  const lightning = isWanLightningModel(request.model);

  const parts = [
    `${duration}.`,
    subject ? `Subject/action: ${subject}.` : '',
    motion ? `Motion: ${motion}.` : '',
    camera
      ? `Camera: ${camera}.`
      : distilled
        ? 'Camera: one gentle continuous move, stable framing.'
        : 'Camera: stable cinematic framing with gentle movement.',
    style ? `Look: ${style}.` : '',
    distilled
      ? lightning
        ? 'Single clear subject, one continuous action — keep the shot simple for 4-step Lightning.'
        : 'Single clear subject, one continuous action — keep the shot simple for Rapid AIO (CFG 1).'
      : '',
    'Maintain temporal continuity; avoid flicker, morphing faces, and abrupt scene cuts.',
    'Keep a stable limb count and coherent hands; do not invent extra arms, legs, people, or props mid-clip.',
  ];
  return parts.filter(Boolean).join(' ');
}

function buildVideoLlmSystemPrompt(model?: string): string {
  const def = model ? getComfyModelDefinition(model) : null;
  const label = def?.label ?? 'video diffusion';
  const distilled = isWanCfg1DistilledModel(model);
  const lightning = isWanLightningModel(model);
  return [
    `You write concise prompts for ${label} text-to-video / image-to-video.`,
    distilled
      ? lightning
        ? 'Optimize for 4-step CFG-1 Lightning: one subject, one continuous motion, simple camera language, minimal competing details.'
        : 'Optimize for Phr00t Rapid AIO (CFG-1, short steps): one subject, one continuous motion, simple camera language, minimal competing details.'
      : 'Emphasize subject action, camera language, motion continuity, and lighting.',
    'Avoid flicker, morphing faces, identity drift, and abrupt cuts.',
    'Keep anatomy stable across frames: consistent limb count, coherent hands/fingers, no duplicate subjects, no suddenly appearing or disappearing props.',
    distilled
      ? 'Do not write multi-subject or highly intricate choreography — CFG-1 drafts collapse under clutter.'
      : '',
    'Return only the prompt text — no markdown, titles, or commentary.',
    distilled
      ? 'Keep the prompt under ~55 words.'
      : 'Keep the prompt under ~80 words unless the subject description needs more.',
  ]
    .filter(Boolean)
    .join(' ');
}

function buildVideoLlmUserPrompt(request: VideoPromptRequest): string {
  const lines = [
    `Subject/action: ${request.subject.trim()}`,
    request.motion?.trim() ? `Motion: ${request.motion.trim()}` : '',
    request.camera?.trim()
      ? `Camera: ${request.camera.trim()}`
      : 'Camera: stable cinematic framing with gentle movement',
    request.style?.trim() ? `Look/style: ${request.style.trim()}` : '',
    typeof request.durationSec === 'number' && request.durationSec > 0
      ? `Duration target: ${request.durationSec}s`
      : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * LLM-backed video prompt with template fallback when LLM is disabled or fails
 * (and template fallback is allowed).
 */
export async function generateVideoPrompt(request: VideoPromptRequest): Promise<{
  prompt: string;
  method: 'llm' | 'template';
}> {
  const template = buildVideoPrompt(request);
  if (request.preferTemplate || !isLlmEnabled()) {
    return { prompt: template, method: 'template' };
  }

  try {
    const content = await chatCompletion({
      messages: [
        { role: 'system', content: buildVideoLlmSystemPrompt(request.model) },
        { role: 'user', content: buildVideoLlmUserPrompt(request) },
      ],
      maxTokens: 320,
      temperature: 0.7,
      usageContext: { route: 'video-prompt' },
    });
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Empty LLM response.');
    }
    return { prompt: trimmed, method: 'llm' };
  } catch (error) {
    if (allowTemplateFallback()) {
      return { prompt: template, method: 'template' };
    }
    throw error;
  }
}

export type VideoInitScan = {
  subject: string;
  motion: string;
};

const VIDEO_SCAN_SUBJECT_MAX = 600;
const VIDEO_SCAN_MOTION_MAX = 400;

function clipScanField(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

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

/** Parse a vision reply into Video subject + motion fields. */
export function parseVideoInitScan(raw: string): VideoInitScan {
  const cleaned = stripPromptArtifacts(raw).trim();
  const json = extractJsonObject(cleaned);
  const fromJsonSubject =
    typeof json?.subject === 'string'
      ? json.subject
      : typeof json?.action === 'string'
        ? json.action
        : '';
  const fromJsonMotion =
    typeof json?.motion === 'string'
      ? json.motion
      : typeof json?.camera === 'string'
        ? json.camera
        : '';
  if (fromJsonSubject.trim()) {
    return {
      subject: clipScanField(fromJsonSubject, VIDEO_SCAN_SUBJECT_MAX),
      motion:
        clipScanField(fromJsonMotion, VIDEO_SCAN_MOTION_MAX) ||
        'Gentle continuous motion that continues this freeze-frame, stable camera.',
    };
  }
  const prose = cleaned.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const sentenceSplit = prose.match(/^(.+?[.!?])\s+([\s\S]+)$/);
  if (sentenceSplit?.[1] && sentenceSplit[2]) {
    return {
      subject: clipScanField(sentenceSplit[1], VIDEO_SCAN_SUBJECT_MAX),
      motion: clipScanField(sentenceSplit[2], VIDEO_SCAN_MOTION_MAX),
    };
  }
  return {
    subject: clipScanField(prose, VIDEO_SCAN_SUBJECT_MAX) || 'the subject in the first frame',
    motion: 'Gentle continuous motion that continues this freeze-frame, stable camera.',
  };
}

export async function scanVideoInitFrame(options: {
  imageDataUrl: string;
  camera?: string;
  style?: string;
  extraHints?: string;
  llm?: LlmRequestOptions;
}): Promise<VideoInitScan> {
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

  const content = await visionCompletion({
    systemPrompt: `You read a still that will be the first frame of an image-to-video clip.
Return ONLY JSON: {"subject":"","motion":""}
- subject: one or two sentences of who/what is visible — pose, clothes, setting. Do not invent unseen people or places.
- motion: one sentence of plausible continuing action and a simple camera move that could start from this freeze-frame. Not a new scene.
- No markdown, no commentary.`,
    textPrompt: [
      'This still is the I2V first frame. Fill subject and motion for a video prompt.',
      options.camera?.trim() ? `Camera preference: ${options.camera.trim()}` : '',
      options.style?.trim() ? `Look/style: ${options.style.trim()}` : '',
      options.extraHints?.trim() ? `Player notes: ${options.extraHints.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    imageDataUrl: options.imageDataUrl,
    maxTokens: 280,
    temperature: 0.35,
    model: visionModel,
    endpoint: resolveRequestLlmEndpoint(options.llm),
    usageContext: { route: 'video-prompt-scan' },
  });

  const scanned = parseVideoInitScan(content);
  if (!scanned.subject.trim()) {
    throw new Error('Vision scan returned an empty subject. Try a clearer still.');
  }
  return scanned;
}
