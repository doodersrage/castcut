/**
 * A contact sheet of Gallery entries (print-sheets.ts storyboardHtml): each picture numbered,
 * with its tool, date, model and the start of its prompt — a page to print, or send round for a
 * pick. Pure.
 */

import type { StoryboardFrame } from '../print/print-sheets';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export function contactSheetFrames(
  entries: readonly ComfyGalleryEntry[],
  pictureOf: (entry: ComfyGalleryEntry) => string | null | undefined
): StoryboardFrame[] {
  return entries.map((entry, index) => {
    const at =
      (entry as { createdAt?: number; completedAt?: number }).completedAt ??
      (entry as { createdAt?: number }).createdAt;
    return {
      number: String(index + 1),
      image: pictureOf(entry) || undefined,
      heading:
        [entry.tool, at ? new Date(at).toLocaleDateString() : ''].filter(Boolean).join(' · ') ||
        'Gallery',
      notes: [
        ['Model', entry.model],
        [
          'Prompt',
          entry.prompt ? entry.prompt.slice(0, 160) + (entry.prompt.length > 160 ? '…' : '') : '',
        ],
      ],
    };
  });
}
