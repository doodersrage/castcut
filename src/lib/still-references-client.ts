'use client';

import { loadComfyGallery } from './comfyui-gallery';
import { getGalleryEntryById } from './gallery-db-store';
import { stillReferencesFromGraph, type StillReference } from './still-references';

/**
 * The pictures a finished still was made from: its stored graph when the Gallery kept one, else
 * the graph ComfyUI still has in its history. Empty when neither is available.
 */
export async function loadStillReferences(promptId: string): Promise<StillReference[]> {
  const id = promptId.trim();
  if (!id) return [];
  const listed = loadComfyGallery().find(entry => entry.promptId === id);
  const stored = listed
    ? (getGalleryEntryById(listed.id)?.workflowJson ?? listed.workflowJson)
    : undefined;
  if (stored?.trim()) {
    try {
      const refs = stillReferencesFromGraph(JSON.parse(stored));
      if (refs.length) return refs;
    } catch {
      // fall through to history
    }
  }
  try {
    const params = new URLSearchParams({ promptId: id });
    if (listed?.comfyUrl) params.set('comfyUrl', listed.comfyUrl);
    const response = await fetch(`/api/comfyui/history/workflow?${params.toString()}`);
    if (!response.ok) return [];
    const data = (await response.json()) as { workflow?: unknown };
    return stillReferencesFromGraph(data.workflow);
  } catch {
    return [];
  }
}
