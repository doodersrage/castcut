import type { EngineId } from './engine/types';
import { isCloudEngine } from './engine/capabilities';
import { normalizeComposeIdentityLockStrength } from './compose-identity-lock';

/** Documented Fal endpoints that take `image_urls` (not a single `image_url`). */
export const FAL_MULTI_REF_EDIT_MODELS = [
  'fal-ai/flux-pro/kontext/multi',
  'fal-ai/flux-pro/kontext/max/multi',
  'fal-ai/flux-2/edit',
  'fal-ai/flux-2-pro/edit',
  'fal-ai/flux-2-flex/edit',
  'fal-ai/flux-2-max/edit',
  'fal-ai/nano-banana/edit',
  'fal-ai/nano-banana-pro/edit',
  'fal-ai/nano-banana-2/edit',
  'fal-ai/bytedance/seedream/v4/edit',
  'fal-ai/qwen-image-edit',
] as const;

/**
 * Documented Replicate multi-image edit endpoints.
 * These take `input_image_1` + `input_image_2` (exactly two refs).
 */
export const REPLICATE_MULTI_REF_EDIT_MODELS = [
  'flux-kontext-apps/multi-image-kontext-pro',
  'flux-kontext-apps/multi-image-kontext-max',
] as const;

export const CLOUD_COMPOSE_SINGLE_REF_WARNING =
  'Cloud img2img sends Image 1 only. Image 2–4 stay in the prompt.';

export const CLOUD_COMPOSE_TRANSFER_BLOCKED =
  'Transfer needs Image 2 on the model. This cloud img2img endpoint is single-ref — switch to Fal Kontext multi / FLUX.2 edit / Replicate multi-image Kontext, or queue on local Comfy.';

export type CloudMultiRefFieldStyle = 'image_urls' | 'input_image_1_2';

function normalizeCloudModelId(modelId?: string | null): string {
  return String(modelId ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');
}

function matchesKnownModel(id: string, known: readonly string[]): boolean {
  if (!id) {
    return false;
  }
  return known.some(entry => id === entry || id.endsWith(`/${entry}`));
}

export function isFalMultiRefEditModel(modelId?: string | null): boolean {
  return matchesKnownModel(normalizeCloudModelId(modelId), FAL_MULTI_REF_EDIT_MODELS);
}

export function isReplicateMultiRefEditModel(modelId?: string | null): boolean {
  return matchesKnownModel(normalizeCloudModelId(modelId), REPLICATE_MULTI_REF_EDIT_MODELS);
}

/** True when the selected cloud img2img model documents multi-image inputs. */
export function isCloudMultiRefEditModel(
  engine: EngineId | undefined,
  modelId?: string | null
): boolean {
  if (engine === 'fal') {
    return isFalMultiRefEditModel(modelId);
  }
  if (engine === 'replicate') {
    return isReplicateMultiRefEditModel(modelId);
  }
  return false;
}

export function cloudMultiRefFieldStyle(
  engine: EngineId | undefined,
  modelId?: string | null
): CloudMultiRefFieldStyle | null {
  if (engine === 'fal' && isFalMultiRefEditModel(modelId)) {
    return 'image_urls';
  }
  if (engine === 'replicate' && isReplicateMultiRefEditModel(modelId)) {
    return 'input_image_1_2';
  }
  return null;
}

/** Replicate multi-image Kontext accepts exactly two refs. */
export function cloudMultiRefMaxImages(
  engine: EngineId | undefined,
  modelId?: string | null
): number | null {
  if (!isCloudMultiRefEditModel(engine, modelId)) {
    return null;
  }
  if (engine === 'replicate') {
    return 2;
  }
  return 4;
}

export function cloudComposeSendsOnlyImage1(
  engine: EngineId | undefined,
  modelId?: string | null
): boolean {
  return isCloudEngine(engine) && !isCloudMultiRefEditModel(engine, modelId);
}

export function extraCloudComposeFilenames(
  filenames: Array<string | undefined> | undefined,
  engine: EngineId | undefined,
  modelId?: string | null
): string[] {
  if (!isCloudMultiRefEditModel(engine, modelId)) {
    return [];
  }
  const max = cloudMultiRefMaxImages(engine, modelId) ?? 4;
  return (filenames ?? [])
    .slice(1, max)
    .map(name => name?.trim() ?? '')
    .filter(Boolean);
}

export function filledComposeExtraCount(filenames: Array<string | undefined> | undefined): number {
  return (filenames ?? []).slice(1).filter(name => name?.trim()).length;
}

export function cloudComposeBlocksTransfer(input: {
  engine?: EngineId;
  modelId?: string | null;
  mode?: string;
  extraFilled?: boolean;
}): boolean {
  if (input.mode !== 'transfer' || !input.extraFilled) {
    return false;
  }
  return cloudComposeSendsOnlyImage1(input.engine, input.modelId);
}

/**
 * Weighted prompt instruction when the cloud API has no IP-Adapter.
 * Strength scales how forcefully identity language is injected.
 */
export function formatCloudFaceRefPromptInstruction(strength?: number): string {
  const weight = normalizeComposeIdentityLockStrength(strength);
  if (weight >= 0.7) {
    return (
      'Identity lock (cloud face-ref, strong): match the face, hairline, skin tone, and likeness ' +
      'from the first identity reference image. Preserve gender presentation. Do not invent a different person.'
    );
  }
  if (weight <= 0.3) {
    return (
      'Identity lock (cloud face-ref, soft): keep a recognizable likeness to the identity reference ' +
      'while allowing the edit instruction to reshape the scene.'
    );
  }
  return (
    'Identity lock (cloud face-ref): preserve facial identity, gender presentation, and likeness ' +
    `from the identity reference (weight ${weight.toFixed(2)}). Keep the subject the same person.`
  );
}

export function appendCloudFaceRefPrompt(prompt: string, instruction?: string | null): string {
  const base = prompt.trim();
  const note = instruction?.trim();
  if (!note) {
    return base;
  }
  if (!base) {
    return note;
  }
  if (base.includes(note)) {
    return base;
  }
  return `${base}\n\n${note}`;
}

export type CloudComposeFaceRefPayload = {
  /** Ordered filenames for the cloud img2img request (Image 1 first after optional face prepend). */
  filenames: string[];
  /** Primary canvas / Image 1 filename after reorder. */
  image1Filename?: string;
  /** True when the selected model can take multiple image refs. */
  multiRef: boolean;
  fieldStyle: CloudMultiRefFieldStyle | null;
  /** Prompt suffix — cloud APIs have no IP-Adapter. */
  promptInstruction: string;
  /** Whether a distinct session face was prepended ahead of Image 1. */
  facePrepended: boolean;
};

/**
 * Build the cloud face-ref lock payload: session face + Image 1 (+ extras on multi-ref),
 * plus a weighted prompt instruction. Local Comfy IP-Adapter path is unchanged.
 */
export function buildCloudComposeFaceRefPayload(input: {
  enabled: boolean;
  engine?: EngineId;
  modelId?: string | null;
  image1Filename?: string | null;
  sessionFaceFilename?: string | null;
  extraFilenames?: Array<string | undefined> | null;
  strength?: number;
}): CloudComposeFaceRefPayload | null {
  if (!input.enabled || !isCloudEngine(input.engine)) {
    return null;
  }

  const image1 = input.image1Filename?.trim() || '';
  const face = input.sessionFaceFilename?.trim() || '';
  const extras = (input.extraFilenames ?? [])
    .map(name => name?.trim() ?? '')
    .filter(Boolean)
    .filter(name => name !== image1 && name !== face);

  const multiRef = isCloudMultiRefEditModel(input.engine, input.modelId);
  const fieldStyle = cloudMultiRefFieldStyle(input.engine, input.modelId);
  const max = cloudMultiRefMaxImages(input.engine, input.modelId) ?? 1;
  const promptInstruction = formatCloudFaceRefPromptInstruction(input.strength);

  const ordered: string[] = [];
  const faceDistinct = Boolean(face && face !== image1);

  if (multiRef && faceDistinct) {
    ordered.push(face);
  }
  if (image1) {
    ordered.push(image1);
  } else if (face) {
    // No Image 1 — session face becomes the sole canvas (matches identity fallback).
    ordered.push(face);
  }
  if (multiRef) {
    for (const extra of extras) {
      if (ordered.length >= max) {
        break;
      }
      ordered.push(extra);
    }
  }

  if (ordered.length === 0) {
    return null;
  }

  return {
    filenames: ordered.slice(0, max),
    image1Filename: ordered[faceDistinct && multiRef ? 1 : 0] || ordered[0],
    multiRef,
    fieldStyle,
    promptInstruction,
    facePrepended: Boolean(multiRef && faceDistinct),
  };
}

export function formatCloudComposeIdentityHint(input: {
  enabled: boolean;
  strength?: number;
  multiRef?: boolean;
  hasSessionFace?: boolean;
}): string {
  if (!input.enabled) {
    return 'Off — cloud img2img uses Image 1 only (no face-ref lock).';
  }
  const strength = normalizeComposeIdentityLockStrength(input.strength);
  if (input.multiRef && input.hasSessionFace) {
    return (
      `Cloud face-ref @ ${strength.toFixed(2)} — session face + Image 1 sent as ordered multi-refs ` +
      `(no IP-Adapter on cloud).`
    );
  }
  if (input.multiRef) {
    return (
      `Cloud face-ref @ ${strength.toFixed(2)} — Image 1 (+ extras) on multi-ref edit with a weighted ` +
      `identity prompt (no IP-Adapter on cloud).`
    );
  }
  return (
    `Cloud face-ref @ ${strength.toFixed(2)} — single-ref img2img keeps Image 1; identity is a weighted ` +
    `prompt instruction only (switch to Kontext multi / FLUX.2 edit / Replicate multi-image for dual refs).`
  );
}
