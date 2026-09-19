import type { QueueQualityProfile } from './queue-quality-profile';

const pendingRefineAfterUpscale = new Map<
  string,
  { qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'> }
>();

const pendingSkinRefineAfterStill = new Map<string, { model: string }>();

export function scheduleRefineAfterUpscaleComplete(
  promptId: string,
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>
): void {
  const trimmed = promptId.trim();
  if (!trimmed) {
    return;
  }
  pendingRefineAfterUpscale.set(trimmed, { qualityProfile });
}

export function consumePendingRefineAfterUpscale(
  promptId: string
): { qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'> } | undefined {
  const trimmed = promptId.trim();
  const pending = pendingRefineAfterUpscale.get(trimmed);
  pendingRefineAfterUpscale.delete(trimmed);
  return pending;
}

/** Schedule a soft skin-fix pass when this Day/Story still finishes. */
export function scheduleSkinRefineAfterStillComplete(promptId: string, model: string): void {
  const trimmed = promptId.trim();
  const refineModel = model.trim();
  if (!trimmed || !refineModel) {
    return;
  }
  pendingSkinRefineAfterStill.set(trimmed, { model: refineModel });
}

export function consumePendingSkinRefineAfterStill(
  promptId: string
): { model: string } | undefined {
  const trimmed = promptId.trim();
  const pending = pendingSkinRefineAfterStill.get(trimmed);
  pendingSkinRefineAfterStill.delete(trimmed);
  return pending;
}

/** Test helper — drop pending maps between cases. */
export function clearGalleryPendingActionsForTests(): void {
  pendingRefineAfterUpscale.clear();
  pendingSkinRefineAfterStill.clear();
}
