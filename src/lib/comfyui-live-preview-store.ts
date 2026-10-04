'use client';

export const COMFY_LIVE_PREVIEW_UPDATED_EVENT = 'comfyui-live-preview-updated';

/** promptId → object URL */
const previews = new Map<string, string>();
/** clientId → promptId (so gallery cards can resolve either key) */
const clientToPrompt = new Map<string, string>();
/** Prompt ids never previewed live (adult stills held by the adult-appearance gate). */
const suppressed = new Set<string>();

/** Never show live frames of this job (an adult still waits for the adult-appearance gate). */
export function suppressComfyLivePreview(promptId: string): void {
  const id = promptId.trim();
  if (!id) return;
  suppressed.add(id);
  if (previews.has(id)) setComfyLivePreviewUrl(id, null);
}

function revokeLater(url: string): void {
  // Defer revoke so React can swap <img src> before the blob disappears.
  if (typeof window === 'undefined') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
    return;
  }
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, 2500);
}

export function setComfyLivePreviewUrl(
  promptId: string,
  url: string | null,
  options?: { alsoKeys?: string[] }
): void {
  const id = promptId.trim();
  if (!id) {
    return;
  }
  if (url && suppressed.has(id)) {
    revokeLater(url);
    return;
  }

  const clientIds = (options?.alsoKeys ?? [])
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));

  const previous = previews.get(id);
  if (!url) {
    previews.delete(id);
    for (const [clientId, mapped] of [...clientToPrompt]) {
      if (mapped === id) {
        clientToPrompt.delete(clientId);
      }
    }
    if (previous) {
      revokeLater(previous);
    }
  } else {
    previews.set(id, url);
    for (const clientId of clientIds) {
      clientToPrompt.set(clientId, id);
    }
    if (previous && previous !== url) {
      revokeLater(previous);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(COMFY_LIVE_PREVIEW_UPDATED_EVENT, {
        detail: { promptId: id, keys: [id, ...clientIds] },
      })
    );
  }
}

/** Resolve a live frame by prompt id and/or websocket client id. */
export function getComfyLivePreviewUrl(
  promptId?: string | null,
  alsoKeys?: Array<string | undefined | null>
): string | null {
  const id = promptId?.trim();
  if (id) {
    const direct = previews.get(id);
    if (direct) {
      return direct;
    }
  }

  for (const key of alsoKeys ?? []) {
    const trimmed = key?.trim();
    if (!trimmed) {
      continue;
    }
    const mappedPrompt = clientToPrompt.get(trimmed);
    if (mappedPrompt) {
      const mapped = previews.get(mappedPrompt);
      if (mapped) {
        return mapped;
      }
    }
    const asPrompt = previews.get(trimmed);
    if (asPrompt) {
      return asPrompt;
    }
  }

  return null;
}

export function clearComfyLivePreviewUrl(promptId: string): void {
  setComfyLivePreviewUrl(promptId, null);
}

export function clearAllComfyLivePreviewUrls(): void {
  for (const url of new Set(previews.values())) {
    revokeLater(url);
  }
  previews.clear();
  clientToPrompt.clear();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(COMFY_LIVE_PREVIEW_UPDATED_EVENT, {
        detail: { promptId: undefined, keys: [] as string[] },
      })
    );
  }
}
