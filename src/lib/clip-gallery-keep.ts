'use client';

/**
 * Keep a finished clip the server made (Make it 30 s, Add voice) in the Gallery: until now it
 * lived only as a ComfyUI input file, linked from the slot — not in the Gallery, and lost when
 * ComfyUI's input folder is cleaned. The MP4 is stored like any gallery original and the slot
 * points at the durable copy. Falls back to the original URL when storage is unavailable.
 */

import { addComfyGalleryEntry, loadComfyGallery } from './comfyui-gallery';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { loadComfyUiSettings } from './comfyui-settings';
import { persistGalleryOriginal } from './gallery-media-client';

export async function keepClipInGallery(input: {
  url: string;
  kind: 'extend' | 'voice';
  prompt: string;
  tool: 'day' | 'roleplay';
  /** The clip it came from: its gallery entry is found by job id for the parent link and Cast. */
  sourcePromptId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ url: string; entryId?: string }> {
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, { credentials: 'same-origin' });
    if (!response.ok) return { url: input.url };
    const blob = await response.blob();
    const id = crypto.randomUUID();
    const filename = `castcut-${input.kind === 'extend' ? 'extended' : 'voiced'}-${id.slice(0, 8)}.mp4`;
    const persisted = await persistGalleryOriginal(
      id,
      new File([blob], filename, { type: 'video/mp4' })
    );
    if (!persisted || persisted.skipped || !persisted.originalPath || !persisted.originalUrl) {
      return { url: input.url };
    }
    const source: ComfyGalleryEntry | undefined = input.sourcePromptId
      ? loadComfyGallery().find(entry => entry.promptId === input.sourcePromptId)
      : undefined;
    addComfyGalleryEntry({
      id,
      promptId: `${input.kind}-${id}`,
      prompt: input.prompt,
      tool: input.tool,
      derivedKind: input.kind,
      characterId: source?.characterId,
      lookId: source?.lookId,
      parentGalleryEntryId: source?.id,
      projectId: source?.projectId,
      comfyUrl: loadComfyUiSettings().apiUrl?.trim() || 'http://127.0.0.1:8188',
      status: 'completed',
      completedAt: Date.now(),
      images: [{ filename, subfolder: '', type: 'output', format: 'video/mp4' }],
      durableOriginalPath: persisted.originalPath,
      durableThumbPath: persisted.thumbPath,
      sourceImageUrl: persisted.originalUrl,
      userTags: [input.kind === 'extend' ? '30s' : 'voice'],
    });
    return { url: persisted.originalUrl, entryId: id };
  } catch {
    return { url: input.url };
  }
}
