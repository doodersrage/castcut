'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { ComfyOutputImage } from '@/lib/comfyui-outputs';
import type { FixAreaBox, FixAreaMode } from '@/lib/fix-area';

/** What a caller (Gallery, Day, Story, Outfit) hands the Fix an area dialog. */
export type FixAreaTarget = {
  /** What the dialog paints over (any URL the browser can load). */
  displayUrl: string;
  /** ComfyUI view URL of the picture as shown — the fix's base. Null: can't be fixed. */
  comfyUrl: string | null;
  /** ComfyUI view URL of the render whose graph to reuse, when the shown picture is a finish of it. */
  graphUrl?: string | null;
  /** The queued workflow JSON (gallery entry), used when ComfyUI kept no graph in the PNG. */
  workflowJson?: string | null;
  /**
   * The still's gallery entry: its stored workflow is read at Fix time (the Gallery's list view
   * leaves `workflowJson` out of its entries).
   */
  galleryEntryId?: string | null;
  title?: string;
  /** An adult still: candidates pass the adult-appearance gate before they are shown. */
  adult?: { clothed?: boolean } | null;
  /**
   * Fix the face: a ComfyUI view URL of the Cast's face crop to use as the identity reference.
   * Left out, the server takes the face picture the still's own graph used (or cuts one from
   * its plate).
   */
  faceUrl?: string | null;
  /** "Use this": the caller swaps the picture in (and keeps the original reversible). */
  onUse: (result: FixAreaUseResult) => void | Promise<void>;
};

export type FixAreaUseResult = {
  /** `/api/comfyui/view?…` of the fixed picture. */
  imageUrl: string;
  image: ComfyOutputImage;
  promptId: string;
  seed: number;
  /** The base the fix was made on (the original). */
  originalUrl: string;
  text: string;
  /** The adult-appearance gate's verdict on this candidate (adult stills only). */
  adultCheck?: 'passed' | 'unchecked';
};

export type FixAreaJob = { promptId: string; seed: number };

export function comfyImageViewUrl(image: { filename: string; subfolder?: string; type?: string }) {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type ?? 'output',
  });
  return `/api/comfyui/view?${params.toString()}`;
}

function comfyUrlSetting(): string | undefined {
  return loadComfyUiSettings().apiUrl?.trim() || undefined;
}

export type FixAreaQueued = {
  jobs: FixAreaJob[];
  /** Fix the face: the Cast face went in as the identity reference. */
  identity: boolean;
  identityNote?: string;
};

/** Queue the candidates; rejects with the reason when the still can't be fixed. */
export async function queueFixArea(input: {
  target: Pick<
    FixAreaTarget,
    'comfyUrl' | 'graphUrl' | 'workflowJson' | 'galleryEntryId' | 'faceUrl'
  >;
  mask: string;
  text: string;
  mode?: FixAreaMode;
}): Promise<FixAreaQueued> {
  if (!input.target.comfyUrl) {
    throw new Error("This picture's ComfyUI output isn't available, so it can't be fixed here.");
  }
  let workflow: unknown;
  let workflowJson = input.target.workflowJson ?? null;
  if (!workflowJson && input.target.galleryEntryId) {
    const { getGalleryEntryById } = await import('@/lib/gallery-db-store');
    workflowJson = getGalleryEntryById(input.target.galleryEntryId)?.workflowJson ?? null;
  }
  if (workflowJson) {
    try {
      workflow = JSON.parse(workflowJson) as unknown;
    } catch {
      workflow = undefined;
    }
  }
  const comfyUrl = comfyUrlSetting();
  const response = await fetch('/api/fix-area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      imageUrl: input.target.comfyUrl,
      ...(input.target.graphUrl ? { graphUrl: input.target.graphUrl } : {}),
      ...(workflow && typeof workflow === 'object' ? { workflow } : {}),
      mask: input.mask,
      text: input.text,
      ...(input.mode === 'face' ? { mode: 'face' } : {}),
      ...(input.mode === 'face' && input.target.faceUrl ? { faceUrl: input.target.faceUrl } : {}),
      ...(comfyUrl ? { comfyUrl } : {}),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    available?: boolean;
    reason?: string;
    jobs?: FixAreaJob[];
    identity?: boolean;
    identityNote?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(data.error ?? `Fix an area failed (HTTP ${response.status}).`);
  if (!data.available || !Array.isArray(data.jobs) || data.jobs.length === 0) {
    throw new Error(data.reason ?? 'This picture cannot be fixed here.');
  }
  return {
    jobs: data.jobs,
    identity: data.identity === true,
    ...(typeof data.identityNote === 'string' && data.identityNote
      ? { identityNote: data.identityNote }
      : {}),
  };
}

/**
 * Fix the face: where the face is in the still (the largest, as InsightFace finds it through
 * `/api/face-locate`), as fractions of the picture. Null when none was found or the detector
 * is unavailable (ComfyUI off, no FaceAnalysis pack).
 */
export async function locateFaceInStill(
  displayUrl: string
): Promise<{ face: FixAreaBox | null; reason?: string }> {
  const response = await fetch(displayUrl, { credentials: 'same-origin' });
  if (!response.ok) return { face: null, reason: 'The picture could not be loaded.' };
  const blob = await response.blob();
  const { locateFaceOnPlateBlob } = await import('@/lib/face-locate-client');
  const located = await locateFaceOnPlateBlob(blob);
  if (!located)
    return { face: null, reason: 'Finding the face needs ComfyUI with the FaceAnalysis pack.' };
  if (!located.available) return { face: null, reason: located.reason };
  if (!located.face) return { face: null, reason: 'No face was found in this picture.' };
  const size = await blobSize(blob);
  if (!size) return { face: null, reason: 'The picture could not be read.' };
  const face = located.face;
  return {
    face: {
      x: face.x / size.width,
      y: face.y / size.height,
      width: face.width / size.width,
      height: face.height / size.height,
    },
  };
}

async function blobSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export type FixAreaPoll =
  | { status: 'pending' }
  | { status: 'running' }
  | { status: 'done'; image: ComfyOutputImage }
  | { status: 'error'; message: string }
  | { status: 'missing' };

export async function pollFixAreaJob(promptId: string): Promise<FixAreaPoll> {
  const comfyUrl = comfyUrlSetting();
  const params = new URLSearchParams({ promptId, ...(comfyUrl ? { comfyUrl } : {}) });
  try {
    const response = await fetch(`/api/fix-area?${params.toString()}`, {
      credentials: 'same-origin',
    });
    // A failed status read is not a verdict: ask again on the next tick.
    if (!response.ok) return { status: 'pending' };
    return (await response.json()) as FixAreaPoll;
  } catch {
    return { status: 'pending' };
  }
}

/** Drop candidates that have not started (never interrupts a running one). */
export function cancelFixAreaJobs(promptIds: string[]): void {
  if (promptIds.length === 0) return;
  const comfyUrl = comfyUrlSetting();
  void fetch('/api/fix-area', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ cancel: promptIds, ...(comfyUrl ? { comfyUrl } : {}) }),
  }).catch(() => undefined);
}
