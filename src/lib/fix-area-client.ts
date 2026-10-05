'use client';

import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import type { ComfyOutputImage } from '@/lib/comfyui-outputs';

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
  title?: string;
  /** An adult still: candidates pass the adult-appearance gate before they are shown. */
  adult?: { clothed?: boolean } | null;
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

/** Queue the candidates; rejects with the reason when the still can't be fixed. */
export async function queueFixArea(input: {
  target: Pick<FixAreaTarget, 'comfyUrl' | 'graphUrl' | 'workflowJson'>;
  mask: string;
  text: string;
}): Promise<FixAreaJob[]> {
  if (!input.target.comfyUrl) {
    throw new Error("This picture's ComfyUI output isn't available, so it can't be fixed here.");
  }
  let workflow: unknown;
  if (input.target.workflowJson) {
    try {
      workflow = JSON.parse(input.target.workflowJson) as unknown;
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
      ...(comfyUrl ? { comfyUrl } : {}),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    available?: boolean;
    reason?: string;
    jobs?: FixAreaJob[];
    error?: string;
  };
  if (!response.ok) throw new Error(data.error ?? `Fix an area failed (HTTP ${response.status}).`);
  if (!data.available || !Array.isArray(data.jobs) || data.jobs.length === 0) {
    throw new Error(data.reason ?? 'This picture cannot be fixed here.');
  }
  return data.jobs;
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
  const response = await fetch(`/api/fix-area?${params.toString()}`, {
    credentials: 'same-origin',
  });
  if (!response.ok) return { status: 'pending' };
  return (await response.json()) as FixAreaPoll;
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
