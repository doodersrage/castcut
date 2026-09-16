/**
 * Fitting Room — lazy on-character wardrobe kit preview cache.
 * Keyed by wardrobeId + lookId; draft try-ons feed the swipe strip.
 */

import type { ComfyImageModel } from '@/lib/comfy-models/client';
import { isEditCapableModel } from '@/lib/model-denoise-defaults';
import { isSystemWorkflowSupportedModel } from '@/lib/system-workflow-runtime';
import type { WorkflowParamValues } from '@/lib/comfyui-config';

export const FITTING_KIT_PREVIEW_CONCURRENCY = 3;
export const FITTING_KIT_PREVIEW_MAX = 16;
/** Portrait frame for swipe thumbs — kept small for fast draft queues. */
export const FITTING_KIT_PREVIEW_WIDTH = 256;
export const FITTING_KIT_PREVIEW_HEIGHT = 384;
/** Bump when preview queue wiring changes so stale thumbs re-queue. */
export const FITTING_KIT_PREVIEW_PROMPT_VERSION = 12;

/** Fast edit stacks for swipe thumbs — never the sidebar keeper model. */
const FITTING_KIT_PREVIEW_MODEL_CANDIDATES: ComfyImageModel[] = [
  'boogu-image-edit-turbo',
  'qwen-image-edit-2511-lightning-4',
  'qwen-image-edit-2511-lightning-8',
];

/**
 * BYO clothing → ghost-mannequin packshot extract.
 * Always prefer distilled stacks — full 2511 is too slow for this intermediate step,
 * and 4-step draft-lite thumbs collapse into pattern walls.
 */
const FITTING_GARMENT_PACKSHOT_MODEL_CANDIDATES: ComfyImageModel[] = [
  'qwen-image-edit-2511-lightning-8',
  'boogu-image-edit-turbo',
  'qwen-image-edit-2511-lightning-4',
  'qwen-image-edit-2511',
];

/** Portrait packshot size — larger than swipe thumbs, smaller than final try-on. */
export const FITTING_GARMENT_PACKSHOT_WIDTH = 576;
export const FITTING_GARMENT_PACKSHOT_HEIGHT = 768;

export function resolveFittingKitPreviewModel(
  fallbackModel?: ComfyImageModel | string
): ComfyImageModel | undefined {
  for (const id of FITTING_KIT_PREVIEW_MODEL_CANDIDATES) {
    if (isSystemWorkflowSupportedModel(id)) {
      return id;
    }
  }
  const fallback = String(fallbackModel ?? '').trim();
  if (fallback && isEditCapableModel(fallback)) {
    return fallback as ComfyImageModel;
  }
  return undefined;
}

/** Distilled / turbo stacks that finish packshot extract quickly. */
export function isFastFittingGarmentPackshotModel(model?: string | null): boolean {
  const id = String(model ?? '').trim();
  return Boolean(id) && (/lightning|turbo|rapid/i.test(id) || /^boogu-image-edit-turbo$/i.test(id));
}

/**
 * Edit model for clothing packshot extract.
 * Prefer Lightning-8 / Boogu even when the sidebar keeper is full 2511 —
 * try-on still uses the sidebar model; this step is only Image 2 prep.
 */
export function resolveFittingGarmentPackshotModel(
  preferredModel?: ComfyImageModel | string
): ComfyImageModel | undefined {
  const preferred = String(preferredModel ?? '').trim();
  // Keep an already-fast sidebar pick (Lightning-8, Boogu Turbo, etc.).
  // Skip Lightning-4 here — candidates prefer 8-step when installed.
  if (
    preferred &&
    isEditCapableModel(preferred) &&
    isFastFittingGarmentPackshotModel(preferred) &&
    !/lightning-4$/i.test(preferred)
  ) {
    return preferred as ComfyImageModel;
  }
  for (const id of FITTING_GARMENT_PACKSHOT_MODEL_CANDIDATES) {
    if (isSystemWorkflowSupportedModel(id)) {
      return id;
    }
  }
  if (preferred && isEditCapableModel(preferred)) {
    return preferred as ComfyImageModel;
  }
  return resolveFittingKitPreviewModel(preferredModel);
}

/** Moderate latent for packshot extract — not swipe-thumb tiny, not final try-on. */
export function fittingGarmentPackshotQueueParams(): WorkflowParamValues {
  return {
    width: String(FITTING_GARMENT_PACKSHOT_WIDTH),
    height: String(FITTING_GARMENT_PACKSHOT_HEIGHT),
    lockLatentSize: 'true',
    preserveInputAspect: 'false',
  };
}

export function fittingKitPreviewQueueParams(): WorkflowParamValues {
  return {
    width: String(FITTING_KIT_PREVIEW_WIDTH),
    height: String(FITTING_KIT_PREVIEW_HEIGHT),
    lockLatentSize: 'true',
    preserveInputAspect: 'false',
    steps: '4',
    cfg: '1',
  };
}

export function fittingKitPreviewQueueResolveOptions(): Pick<
  import('./queue-params-settings').ResolveQueueParamsOptions,
  'resolutionSizeTier' | 'resolutionOrientation' | 'preserveInputAspect'
> {
  return {
    resolutionSizeTier: 'small',
    resolutionOrientation: 'portrait-23',
    preserveInputAspect: false,
  };
}

export type FittingKitPreviewStatus = 'queued' | 'running' | 'completed' | 'error';

export type FittingKitPreview = {
  wardrobeId: string;
  lookId: string;
  promptId?: string;
  imageUrl?: string;
  status: FittingKitPreviewStatus;
  updatedAt: number;
  promptVersion?: number;
};

export function fittingKitPreviewKey(wardrobeId: string, lookId: string): string {
  return `${wardrobeId.trim()}::${lookId.trim()}`;
}

export function normalizeFittingKitPreviews(
  input: Record<string, FittingKitPreview> | undefined
): Record<string, FittingKitPreview> {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const next: Record<string, FittingKitPreview> = {};
  for (const [, entry] of Object.entries(input)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const wardrobeId = typeof entry.wardrobeId === 'string' ? entry.wardrobeId.trim() : '';
    const lookId = typeof entry.lookId === 'string' ? entry.lookId.trim() : '';
    if (!wardrobeId || !lookId) {
      continue;
    }
    const status =
      entry.status === 'queued' ||
      entry.status === 'running' ||
      entry.status === 'completed' ||
      entry.status === 'error'
        ? entry.status
        : 'queued';
    next[fittingKitPreviewKey(wardrobeId, lookId)] = {
      wardrobeId,
      lookId,
      promptId: typeof entry.promptId === 'string' ? entry.promptId.trim() || undefined : undefined,
      imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl.trim() || undefined : undefined,
      status,
      updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now(),
      promptVersion: typeof entry.promptVersion === 'number' ? entry.promptVersion : undefined,
    };
  }
  return next;
}

export function getFittingKitPreview(
  previews: Record<string, FittingKitPreview> | undefined,
  wardrobeId: string,
  lookId: string
): FittingKitPreview | undefined {
  const id = wardrobeId.trim();
  const look = lookId.trim();
  if (!id || !look) {
    return undefined;
  }
  return normalizeFittingKitPreviews(previews)[fittingKitPreviewKey(id, look)];
}

export function upsertFittingKitPreview(
  previews: Record<string, FittingKitPreview> | undefined,
  patch: FittingKitPreview
): Record<string, FittingKitPreview> {
  const wardrobeId = patch.wardrobeId.trim();
  const lookId = patch.lookId.trim();
  if (!wardrobeId || !lookId) {
    return normalizeFittingKitPreviews(previews);
  }
  const key = fittingKitPreviewKey(wardrobeId, lookId);
  const current = normalizeFittingKitPreviews(previews);
  const prev = current[key];
  current[key] = {
    wardrobeId,
    lookId,
    promptId: patch.promptId?.trim() || prev?.promptId,
    imageUrl: patch.imageUrl?.trim() || prev?.imageUrl,
    status: patch.status,
    updatedAt: patch.updatedAt || Date.now(),
    promptVersion: patch.promptVersion ?? prev?.promptVersion,
  };
  return pruneFittingKitPreviews(current);
}

/** Drop oldest completed/error entries when over the cap; keep in-flight. */
export function pruneFittingKitPreviews(
  previews: Record<string, FittingKitPreview>
): Record<string, FittingKitPreview> {
  const entries = Object.entries(previews);
  if (entries.length <= FITTING_KIT_PREVIEW_MAX * 4) {
    return previews;
  }
  const inFlight = entries.filter(
    ([, entry]) => entry.status === 'queued' || entry.status === 'running'
  );
  const settled = entries
    .filter(([, entry]) => entry.status === 'completed' || entry.status === 'error')
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, FITTING_KIT_PREVIEW_MAX * 3);
  return Object.fromEntries([...inFlight, ...settled]);
}

export type FittingKitPreviewGalleryEntry = {
  promptId: string;
  status?: string;
  imageUrl?: string | null;
};

function statusFromGallery(status: string | undefined): FittingKitPreviewStatus {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'error' || status === 'failed' || status === 'cancelled') {
    return 'error';
  }
  if (status === 'running') {
    return 'running';
  }
  return 'queued';
}

/** Merge gallery poll results into kit preview cache by promptId. */
export function mergeFittingKitPreviewsFromGallery(
  previews: Record<string, FittingKitPreview> | undefined,
  gallery: FittingKitPreviewGalleryEntry[]
): { previews: Record<string, FittingKitPreview>; changed: boolean } {
  const byPrompt = new Map(
    gallery.map(entry => [entry.promptId.trim(), entry] as const).filter(([id]) => Boolean(id))
  );
  let changed = false;
  const current = normalizeFittingKitPreviews(previews);
  const next: Record<string, FittingKitPreview> = { ...current };
  for (const [key, entry] of Object.entries(current)) {
    const promptId = entry.promptId?.trim();
    if (!promptId) {
      continue;
    }
    const match = byPrompt.get(promptId);
    if (!match) {
      continue;
    }
    const imageUrl = match.imageUrl?.trim() || entry.imageUrl;
    const status = statusFromGallery(match.status);
    if (entry.imageUrl === imageUrl && entry.status === status) {
      continue;
    }
    changed = true;
    next[key] = {
      ...entry,
      imageUrl,
      status,
      updatedAt: Date.now(),
    };
  }
  return { previews: changed ? pruneFittingKitPreviews(next) : current, changed };
}

/** Kits in the swipe deck that still need a preview for this look. */
export function fittingKitsNeedingPreview(
  deck: Array<{ id: string }>,
  previews: Record<string, FittingKitPreview> | undefined,
  lookId: string,
  limit = FITTING_KIT_PREVIEW_MAX,
  focusWardrobeId?: string
): string[] {
  const look = lookId.trim();
  if (!look) {
    return [];
  }
  const cache = normalizeFittingKitPreviews(previews);
  const focusIndex = focusWardrobeId?.trim()
    ? deck.findIndex(kit => kit.id === focusWardrobeId.trim())
    : -1;
  const ordered = focusIndex > 0 ? [...deck.slice(focusIndex), ...deck.slice(0, focusIndex)] : deck;
  const needed: string[] = [];
  for (const kit of ordered) {
    const id = kit.id.trim();
    if (!id) {
      continue;
    }
    const existing = cache[fittingKitPreviewKey(id, look)];
    if (
      existing?.status === 'completed' &&
      existing.imageUrl?.trim() &&
      (existing.promptVersion ?? 0) >= FITTING_KIT_PREVIEW_PROMPT_VERSION
    ) {
      continue;
    }
    if (existing?.status === 'queued' || existing?.status === 'running') {
      continue;
    }
    needed.push(id);
    if (needed.length >= limit) {
      break;
    }
  }
  return needed;
}

export function countInFlightFittingKitPreviews(
  previews: Record<string, FittingKitPreview> | undefined,
  lookId?: string
): number {
  const look = lookId?.trim();
  return Object.values(normalizeFittingKitPreviews(previews)).filter(entry => {
    if (entry.status !== 'queued' && entry.status !== 'running') {
      return false;
    }
    if (look && entry.lookId !== look) {
      return false;
    }
    return true;
  }).length;
}
