/**
 * Lightning Day face-break has no working IP-Adapter/InstantID path.
 * A denoise-1 second Edit pass (vanilla or Lightning) rewrote whole frames:
 * clones, mesh artifacts, crushed lighting. That auto-restore is disabled.
 *
 * Identity stays on the first Lightning pass: VL face crop + Cast LoRA + prompt.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

/** @deprecated Auto face-restore is disabled — kept for queue-param filename checks. */
export const DAY_VACATION_FACE_RESTORE_MODEL = 'qwen-image-edit-2511-lightning-8' as const;

const FACE_BREAK_FILENAME_RE = /^day-vacation-face[-_]/i;
const FACE_ID_REF_FILENAME_RE = /^day-face-id-ref[-_]/i;

/** Matches wrecked auto-restore prompts so Day board will not adopt those children. */
export const DAY_VACATION_FACE_RESTORE_PROMPT_RE =
  /Change only the face of the person in Image 1|Replace ONLY the face in Image 1/i;

export function isDayVacationFaceRestorePrompt(prompt: string | null | undefined): boolean {
  return DAY_VACATION_FACE_RESTORE_PROMPT_RE.test(String(prompt ?? ''));
}

export function isDayVacationFaceBreakFilename(filename: string | null | undefined): boolean {
  const name = String(filename ?? '')
    .trim()
    .split(/[/\\]/)
    .pop();
  return Boolean(name && FACE_BREAK_FILENAME_RE.test(name));
}

export function isDayVacationFaceIdRefFilename(filename: string | null | undefined): boolean {
  const name = String(filename ?? '')
    .trim()
    .split(/[/\\]/)
    .pop();
  return Boolean(name && FACE_ID_REF_FILENAME_RE.test(name));
}

export function dayVacationFaceIdRefFilename(stamp = 'day-shared'): string {
  return `day-face-id-ref-${stamp}.png`;
}

export function resolveDayVacationFaceRestoreRefFilename(
  entry: Pick<ComfyGalleryEntry, 'queueParams'>
): string | undefined {
  const params = entry.queueParams;
  if (!params) {
    return undefined;
  }
  const candidates: Array<string | undefined> = [
    params.ipAdapterImageFilename?.toString(),
    ...(Array.isArray(params.ipAdapterImageFilenames)
      ? params.ipAdapterImageFilenames.map(name => name?.toString())
      : []),
    ...(Array.isArray(params.inputImageFilenames)
      ? params.inputImageFilenames.map(name => name?.toString())
      : []),
    params.inputImageFilename?.toString(),
  ];
  for (const raw of candidates) {
    const name = raw?.trim();
    if (name && isDayVacationFaceBreakFilename(name)) {
      return name;
    }
  }
  return undefined;
}

export function resolveDayVacationFaceRestoreModel(
  entry: Pick<ComfyGalleryEntry, 'model'>
): string {
  const model = String(entry.model ?? '').trim();
  return model || DAY_VACATION_FACE_RESTORE_MODEL;
}

/** Always false — full-frame face restore wrecked Lightning Day stills. */
export function galleryEntryNeedsDayVacationFaceRestore(
  _entry: Pick<
    ComfyGalleryEntry,
    'status' | 'tool' | 'model' | 'derivedKind' | 'parentGalleryEntryId' | 'queueParams' | 'images'
  >
): boolean {
  return false;
}

export function resetDayVacationFaceRestoreScheduleForTests(): void {
  // Auto-restore removed; kept so existing tests can call it.
}

/** No-op — do not queue a second Edit pass after Lightning Day stills. */
export function maybeScheduleDayVacationFaceRestore(_entry: ComfyGalleryEntry): void {
  return;
}
