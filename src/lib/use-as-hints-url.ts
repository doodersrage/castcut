import { galleryCardCaption } from './gallery-card-caption';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { ComfyGalleryEntry } from './comfyui-gallery';
import { extractHintsFromHistoryEntry, resolveHistoryEntryNavigation } from './tool-navigation';

export function buildUseAsHintsUrl(entry: PromptHistoryEntry): string {
  const { path, mode } = resolveHistoryEntryNavigation(entry);
  const params = new URLSearchParams();
  params.set('hintSource', 'manual');

  if (mode) {
    params.set('mode', mode);
  }

  const hints = extractHintsFromHistoryEntry(entry);
  if (hints) {
    params.set('hints', hints);
  }

  if (entry.model && entry.model !== 'n/a') {
    params.set('model', entry.model);
  }

  const presetId =
    typeof entry.metadata?.nsfwPresetId === 'string' ? entry.metadata.nsfwPresetId.trim() : '';
  if (presetId) {
    params.set('nsfwPresetId', presetId);
  }

  const seed = typeof entry.metadata?.seed === 'string' ? entry.metadata.seed.trim() : '';
  if (seed) {
    params.set('seed', seed);
  }

  return `${path}?${params.toString()}`;
}

const EDIT_INSTRUCTION_RE =
  /^\s*(?:Carry out this change on Image 1|Edit Image 1|Edit instruction|OUTFIT \(mandatory\))/i;

/** Build a Generate/Character/… hints URL from a completed gallery entry. */
export function buildUseAsHintsUrlFromGallery(entry: ComfyGalleryEntry): string {
  return buildUseAsHintsUrl({
    id: entry.id,
    prompt: entry.prompt,
    model: entry.model ?? 'n/a',
    tool: entry.tool || 'generate',
    // An edit instruction (Day, Outfit, Story) is not a scene hint — its beat line is.
    hints: EDIT_INSTRUCTION_RE.test(entry.prompt)
      ? galleryCardCaption(entry.prompt)
      : entry.prompt.slice(0, 500),
    timestamp: entry.completedAt ?? entry.queuedAt ?? Date.now(),
  });
}

export function buildGalleryFocusUrl(entryId: string): string {
  const id = entryId.trim();
  if (!id) {
    return '/gallery';
  }
  return `/gallery?focus=${encodeURIComponent(id)}`;
}
