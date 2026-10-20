'use client';

import {
  buildGalleryHandoff,
  buildReeditGalleryHandoff,
  galleryHandoffPath,
  galleryImprovePath,
  galleryPromptEditorPathFromHistory,
  IMPROVE_INTENT_DEFAULT,
  saveGalleryHandoff,
  type GalleryHandoffPayload,
} from '../gallery/handoff';
import { setLineageParent } from '../prompt/lineage-session';
import {
  buildAnatomyRepairGalleryHandoff,
  galleryAnatomyRepairPath,
} from '../adult/anatomy-repair-handoff';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery';
import { applyGalleryStackToSession } from '../gallery/stack-restore';

export function startImproveFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
  parentHistoryId?: string;
}): void {
  const payload: GalleryHandoffPayload = {
    source: 'gallery',
    galleryEntryId: 'result-panel',
    promptId: 'result-panel',
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    model: input.model,
    tool: input.tool,
    imageUrl: input.previewUrl ?? undefined,
    target: 'refine',
    improveIntent: IMPROVE_INTENT_DEFAULT,
    savedAt: Date.now(),
  };
  if (input.parentHistoryId) {
    setLineageParent({
      parentHistoryId: input.parentHistoryId,
      sourcePrompt: input.prompt,
      sourceTool: input.tool,
    });
  }
  saveGalleryHandoff(payload);
  window.location.href = galleryImprovePath();
}

export function startRefineFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
}): void {
  saveGalleryHandoff({
    source: 'gallery',
    galleryEntryId: 'result-panel',
    promptId: 'result-panel',
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    model: input.model,
    tool: input.tool,
    imageUrl: input.previewUrl ?? undefined,
    target: 'refine',
    savedAt: Date.now(),
  });
  window.location.href = galleryHandoffPath('refine');
}

function startEditToolFromResult(
  target: 'inpaint' | 'outpaint' | 'compose' | 'refine' | 'video' | 'controlnet',
  input: {
    prompt: string;
    previewUrl?: string | null;
    model?: string;
    tool?: string;
    negativePrompt?: string;
  }
): void {
  const prefersInpaintModel = target === 'inpaint' || target === 'outpaint';
  saveGalleryHandoff({
    source: 'gallery',
    galleryEntryId: 'result-panel',
    promptId: 'result-panel',
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    model: prefersInpaintModel && input.model !== 'flux-inpaint' ? 'flux-inpaint' : input.model,
    tool: input.tool,
    imageUrl: input.previewUrl ?? undefined,
    target,
    savedAt: Date.now(),
  });
  window.location.href = galleryHandoffPath(target);
}

export function startInpaintFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
}): void {
  startEditToolFromResult('inpaint', input);
}

export function startOutpaintFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
}): void {
  startEditToolFromResult('outpaint', input);
}

export function startComposeFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
}): void {
  startEditToolFromResult('compose', input);
}

export function startVideoFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
}): void {
  startEditToolFromResult('video', input);
}

export function startControlNetFromResult(input: {
  prompt: string;
  previewUrl?: string | null;
  model?: string;
  tool?: string;
  negativePrompt?: string;
}): void {
  startEditToolFromResult('controlnet', input);
}
export function startRefineFromHistoryEntry(entry: {
  id: string;
  prompt: string;
  model?: string;
  tool?: string;
  hints?: string;
}): void {
  saveGalleryHandoff({
    source: 'history',
    galleryEntryId: entry.id,
    promptId: entry.id,
    prompt: entry.prompt,
    model: entry.model,
    tool: entry.tool,
    historyId: entry.id,
    target: 'refine',
    savedAt: Date.now(),
  });
  setLineageParent({
    parentHistoryId: entry.id,
    sourcePrompt: entry.prompt,
    sourceTool: entry.tool,
  });
  window.location.href = galleryHandoffPath('refine');
}
export function startInpaintFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff({
    ...buildGalleryHandoff(entry, 'inpaint'),
    model: entry.model === 'flux-inpaint' ? entry.model : 'flux-inpaint',
  });
  window.location.href = galleryHandoffPath('inpaint');
}

export function startAnatomyRepairFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildAnatomyRepairGalleryHandoff(entry));
  window.location.href = galleryAnatomyRepairPath();
}

export function startOutpaintFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff({
    ...buildGalleryHandoff(entry, 'outpaint'),
    model: entry.model === 'flux-inpaint' ? entry.model : 'flux-inpaint',
  });
  window.location.href = galleryHandoffPath('outpaint');
}

export function startRefineFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'refine'));
  applyGalleryStackToSession(entry, { toast: false });
  window.location.href = galleryHandoffPath('refine');
}

export function startImproveFromGalleryEntry(
  entry: ComfyGalleryEntry,
  options?: { intent?: string }
): void {
  saveGalleryHandoff({
    ...buildGalleryHandoff(entry, 'refine'),
    improveIntent: options?.intent?.trim() || IMPROVE_INTENT_DEFAULT,
  });
  applyGalleryStackToSession(entry, { toast: false });
  window.location.href = galleryImprovePath();
}

export function startComposeFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'compose'));
  window.location.href = galleryHandoffPath('compose');
}

export function startControlNetFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'controlnet'));
  window.location.href = galleryHandoffPath('controlnet');
}

export function startVideoFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'video'));
  window.location.href = galleryHandoffPath('video');
}

export function startRoleplayFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'roleplay'));
  window.location.href = galleryHandoffPath('roleplay');
}

export function startReeditRefineFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'refine'));
  applyGalleryStackToSession(entry, { toast: false });
  window.location.href = galleryHandoffPath('refine');
}

export function startReeditComposeFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'compose'));
  window.location.href = galleryHandoffPath('compose');
}

export function startReeditControlNetFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildReeditGalleryHandoff(entry, 'controlnet'));
  window.location.href = galleryHandoffPath('controlnet');
}

export function startReeditInpaintFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff({
    ...buildReeditGalleryHandoff(entry, 'inpaint'),
    model: entry.model === 'flux-inpaint' ? entry.model : 'flux-inpaint',
  });
  window.location.href = galleryHandoffPath('inpaint');
}

export function startReeditOutpaintFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff({
    ...buildReeditGalleryHandoff(entry, 'outpaint'),
    model: entry.model === 'flux-inpaint' ? entry.model : 'flux-inpaint',
  });
  window.location.href = galleryHandoffPath('outpaint');
}

export function startBackgroundFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'background'));
  window.location.href = galleryHandoffPath('background');
}

export function startMeshFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'mesh'));
  window.location.href = galleryHandoffPath('mesh');
}

export function startImagePromptFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'imagePrompt'));
  window.location.href = galleryHandoffPath('imagePrompt');
}

export function startPromptEditorFromResult(input: {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
  hints?: string;
  previewUrl?: string | null;
}): void {
  saveGalleryHandoff({
    source: 'gallery',
    galleryEntryId: 'result-panel',
    promptId: 'result-panel',
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    hints: input.hints,
    model: input.model,
    tool: input.tool,
    imageUrl: input.previewUrl ?? undefined,
    target: 'promptEditor',
    savedAt: Date.now(),
  });
  window.location.href = galleryHandoffPath('promptEditor');
}

export function startPromptEditorFromHistoryEntry(entry: {
  id: string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  tool?: string;
  hints?: string;
}): void {
  saveGalleryHandoff({
    source: 'history',
    galleryEntryId: entry.id,
    promptId: entry.id,
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    hints: entry.hints,
    model: entry.model,
    tool: entry.tool,
    historyId: entry.id,
    target: 'promptEditor',
    savedAt: Date.now(),
  });
  window.location.href = galleryPromptEditorPathFromHistory();
}

export function startPromptEditorFromGalleryEntry(entry: ComfyGalleryEntry): void {
  saveGalleryHandoff(buildGalleryHandoff(entry, 'promptEditor'));
  window.location.href = galleryHandoffPath('promptEditor');
}
