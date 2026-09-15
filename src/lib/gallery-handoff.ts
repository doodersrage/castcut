import type { ComfyGalleryEntry } from './comfyui-gallery';
import { buildComfyViewPath } from './comfyui-outputs';
import { resolveDurableGalleryStillUrl } from './gallery-media-client';
import type { WorkflowParamValues } from './comfyui-config';
import type { QueueQualityProfile } from './queue-quality-profile';
import { setLineageParent } from './prompt-lineage-session';
import { resolveSharedEffectiveSessionLoraIds } from './comfyui-settings';

export const GALLERY_HANDOFF_KEY = 'gallery-handoff-v1';
export const IMPROVE_INTENT_DEFAULT =
  'Improve fidelity, composition, and prompt alignment while preserving subject identity and scene intent.';

export type GalleryHandoffMode = 'open' | 'reedit' | 'upscale-native' | 'upscale-polish';

export type GalleryHandoffPayload = {
  source: 'gallery' | 'history';
  galleryEntryId: string;
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
  hints?: string;
  historyId?: string;
  imageUrl?: string;
  imageFilename?: string;
  /** Multi-ControlNet reference URLs (index 0 = primary). */
  controlImageUrls?: string[];
  target:
    | 'refine'
    | 'imagePrompt'
    | 'promptEditor'
    | 'inpaint'
    | 'outpaint'
    | 'controlnet'
    | 'video'
    | 'compose'
    | 'background'
    | 'mesh'
    | 'roleplay'
    | 'fitting'
    | 'day'
    | 'moodboard';
  improveIntent?: string;
  /** Gallery → Anatomy repair opens Inpaint with pre-filled limb-fix prompts. */
  anatomyRepair?: boolean;
  queueParams?: WorkflowParamValues;
  /** Restore LoRA session picks (from entry or current session). */
  sessionActiveLoraIds?: string[];
  queueQualityProfile?: QueueQualityProfile;
  /** Compose identity lock backend restored on re-edit. */
  identityKind?: import('./compose-identity-lock').ComposeIdentityKind;
  /** reedit = open tool with same stack; upscale-* routed via gallery enhance actions. */
  handoffMode?: GalleryHandoffMode;
  savedAt: number;
};

export type BuildGalleryHandoffOptions = {
  handoffMode?: GalleryHandoffMode;
  /** Prefer entry.sessionActiveLoraIds; fall back to current session when true. */
  includeSessionLoras?: boolean;
};

function resolveHandoffLoraIds(
  entry: ComfyGalleryEntry,
  includeSessionLoras: boolean
): string[] | undefined {
  if (entry.sessionActiveLoraIds !== undefined) {
    return entry.sessionActiveLoraIds.map(id => id.trim()).filter(Boolean);
  }
  if (!includeSessionLoras) {
    return undefined;
  }
  const session = resolveSharedEffectiveSessionLoraIds(entry.model);
  if (!session || session.length === 0) {
    return undefined;
  }
  return session.map(id => id.trim()).filter(Boolean);
}

export function buildImproveGalleryHandoff(entry: ComfyGalleryEntry): GalleryHandoffPayload {
  return {
    ...buildGalleryHandoff(entry, 'refine'),
    improveIntent: IMPROVE_INTENT_DEFAULT,
  };
}

export function galleryImprovePath(): string {
  return '/refine?from=gallery&improve=1';
}

export function buildGalleryHandoff(
  entry: ComfyGalleryEntry,
  target: GalleryHandoffPayload['target'],
  options?: BuildGalleryHandoffOptions
): GalleryHandoffPayload {
  const image = entry.images[0];
  if (entry.historyId) {
    setLineageParent({
      parentHistoryId: entry.historyId,
      sourcePrompt: entry.prompt,
      sourceTool: entry.tool,
    });
  }
  const handoffMode = options?.handoffMode ?? 'open';
  const includeLoras = options?.includeSessionLoras ?? handoffMode === 'reedit';
  const identityKind = entry.queueParams?.identityKind;
  const controlImageUrls =
    target === 'controlnet' || handoffMode === 'reedit'
      ? resolveControlImageUrlsForHandoff(entry)
      : undefined;
  return {
    source: 'gallery',
    galleryEntryId: entry.id,
    promptId: entry.promptId,
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    model: entry.model,
    tool: entry.tool,
    historyId: entry.historyId,
    imageUrl:
      resolveDurableGalleryStillUrl(entry) ??
      (image ? buildComfyViewPath(entry.comfyUrl, image) : undefined) ??
      entry.sourceImageUrl?.trim() ??
      undefined,
    imageFilename: image?.filename,
    ...(controlImageUrls?.length ? { controlImageUrls } : {}),
    // Re-edit restores sampler/size/LoRA stack; ControlNet also needs mode/strengths.
    queueParams:
      handoffMode === 'reedit' || target === 'controlnet' ? entry.queueParams : undefined,
    queueQualityProfile: handoffMode === 'reedit' ? entry.queueQualityProfile : undefined,
    sessionActiveLoraIds: resolveHandoffLoraIds(entry, includeLoras),
    ...(handoffMode === 'reedit' && identityKind ? { identityKind } : {}),
    handoffMode,
    target,
    savedAt: Date.now(),
  };
}

function resolveControlImageUrlsForHandoff(entry: ComfyGalleryEntry): string[] | undefined {
  if (entry.controlImageUrls?.length) {
    return entry.controlImageUrls.map(url => url.trim()).filter(Boolean);
  }
  const comfyUrl = entry.comfyUrl?.replace(/\/+$/, '') ?? '';
  if (!comfyUrl) {
    return undefined;
  }
  const names = [
    entry.queueParams?.controlImageFilename?.trim() || '',
    ...(entry.queueParams?.controlImageFilenames ?? []).map(name => name?.trim() || ''),
  ].filter(Boolean);
  const unique = [...new Set(names)];
  if (unique.length === 0) {
    return undefined;
  }
  return unique.map(filename =>
    buildComfyViewPath(comfyUrl, { filename, subfolder: '', type: 'input' })
  );
}

/** Re-edit with the same LoRA stack / quality when available. */
export function buildReeditGalleryHandoff(
  entry: ComfyGalleryEntry,
  target: Extract<
    GalleryHandoffPayload['target'],
    'compose' | 'refine' | 'video' | 'controlnet' | 'inpaint' | 'outpaint'
  >
): GalleryHandoffPayload {
  return buildGalleryHandoff(entry, target, {
    handoffMode: 'reedit',
    includeSessionLoras: true,
  });
}

export function saveGalleryHandoff(payload: GalleryHandoffPayload): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(GALLERY_HANDOFF_KEY, JSON.stringify(payload));
}

export function loadGalleryHandoff(
  target?: GalleryHandoffPayload['target']
): GalleryHandoffPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(GALLERY_HANDOFF_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as GalleryHandoffPayload;
    if ((parsed.source !== 'gallery' && parsed.source !== 'history') || !parsed.prompt?.trim()) {
      return null;
    }
    if (target && parsed.target !== target) {
      return null;
    }
    if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
      window.sessionStorage.removeItem(GALLERY_HANDOFF_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearGalleryHandoff(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(GALLERY_HANDOFF_KEY);
}

export async function fetchHandoffImageFile(payload: GalleryHandoffPayload): Promise<File | null> {
  if (!payload.imageUrl) {
    return null;
  }

  const response = await fetch(payload.imageUrl);
  if (!response.ok) {
    throw new Error(`Could not load gallery image (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  const filename = payload.imageFilename?.trim() || `gallery-${payload.promptId.slice(0, 8)}.png`;
  return new File([blob], filename, { type: blob.type || 'image/png' });
}

export function galleryHandoffPath(target: GalleryHandoffPayload['target']): string {
  if (target === 'refine') {
    return '/refine?from=gallery';
  }
  if (target === 'inpaint') {
    return '/inpaint?from=gallery';
  }
  if (target === 'outpaint') {
    return '/outpaint?from=gallery';
  }
  if (target === 'compose') {
    return '/compose?from=gallery';
  }
  if (target === 'promptEditor') {
    return '/prompt?from=gallery';
  }
  if (target === 'controlnet') {
    return '/controlnet?from=gallery';
  }
  if (target === 'video') {
    return '/video?from=gallery';
  }
  if (target === 'background') {
    return '/background?from=gallery';
  }
  if (target === 'mesh') {
    return '/mesh?from=gallery';
  }
  if (target === 'roleplay') {
    return '/roleplay?from=gallery';
  }
  if (target === 'fitting') {
    return '/fitting?from=gallery';
  }
  if (target === 'day') {
    return '/day?from=gallery';
  }
  if (target === 'moodboard') {
    return '/moodboard?from=gallery';
  }
  return '/image-prompt?from=gallery';
}

/** Open Gallery in pick mode — click an image to hand off back to the tool. */
export function galleryPickPath(target: GalleryHandoffPayload['target']): string {
  return `/gallery?pickFor=${encodeURIComponent(target)}`;
}

export function galleryHandoffHomePath(target: GalleryHandoffPayload['target']): string {
  return galleryHandoffPath(target).split('?')[0] || '/';
}

const GALLERY_PICK_TARGETS = new Set<GalleryHandoffPayload['target']>([
  'refine',
  'imagePrompt',
  'promptEditor',
  'inpaint',
  'outpaint',
  'controlnet',
  'video',
  'compose',
  'background',
  'mesh',
  'roleplay',
  'fitting',
  'day',
  'moodboard',
]);

export function parseGalleryPickTarget(
  raw: string | null | undefined
): GalleryHandoffPayload['target'] | null {
  const value = raw?.trim();
  if (!value || !GALLERY_PICK_TARGETS.has(value as GalleryHandoffPayload['target'])) {
    return null;
  }
  return value as GalleryHandoffPayload['target'];
}

export function galleryPickPurposeLabel(target: GalleryHandoffPayload['target']): string {
  switch (target) {
    case 'video':
      return 'Video init image (I2V)';
    case 'refine':
      return 'Refine reference';
    case 'inpaint':
      return 'Inpaint source';
    case 'outpaint':
      return 'Outpaint source';
    case 'controlnet':
      return 'ControlNet reference';
    case 'compose':
      return 'Compose figure';
    case 'imagePrompt':
      return 'Image → Prompt reference';
    case 'promptEditor':
      return 'Prompt editor';
    case 'background':
      return 'Background reference';
    case 'mesh':
      return 'Mesh reference';
    case 'roleplay':
      return 'Story character';
    case 'fitting':
      return 'Outfit plate';
    case 'day':
      return 'Day reference';
    case 'moodboard':
      return 'Look tile';
    default:
      return 'tool reference';
  }
}

export function galleryPickActionLabel(target: GalleryHandoffPayload['target']): string {
  switch (target) {
    case 'video':
      return 'Use for Video';
    case 'refine':
      return 'Use for Refine';
    case 'inpaint':
      return 'Use for Inpaint';
    case 'outpaint':
      return 'Use for Outpaint';
    case 'controlnet':
      return 'Use for ControlNet';
    case 'compose':
      return 'Use for Compose';
    case 'imagePrompt':
      return 'Use for Image → Prompt';
    case 'background':
      return 'Use for Background';
    case 'mesh':
      return 'Use for Mesh';
    case 'promptEditor':
      return 'Use for Prompt Editor';
    case 'roleplay':
      return 'Use for Story';
    case 'fitting':
      return 'Use for Outfit';
    case 'day':
      return 'Use for Day';
    case 'moodboard':
      return 'Use for Look';
    default:
      return 'Use this image';
  }
}

export function galleryPromptEditorPathFromHistory(): string {
  return '/prompt?from=history';
}

/** Shared settings slice to apply after a re-edit handoff lands. */
export function sharedPatchFromGalleryHandoff(payload: GalleryHandoffPayload): {
  sessionActiveLoraIds?: string[];
  queueQualityProfile?: QueueQualityProfile;
} {
  const patch: {
    sessionActiveLoraIds?: string[];
    queueQualityProfile?: QueueQualityProfile;
  } = {};
  if (payload.sessionActiveLoraIds) {
    patch.sessionActiveLoraIds = payload.sessionActiveLoraIds;
  }
  if (
    payload.handoffMode === 'reedit' &&
    payload.queueQualityProfile &&
    payload.queueQualityProfile !== 'followSettings'
  ) {
    patch.queueQualityProfile = payload.queueQualityProfile;
  }
  return patch;
}
