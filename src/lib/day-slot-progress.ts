/**
 * Slot card progress line (pure). A queued Day still used to read "Queueing…" until it
 * finished, whether it was 5th in line or half rendered. The gallery entry for its prompt
 * carries ComfyUI's queue position and sampler progress; this turns those into a label.
 */

import type { ComfyGalleryJobStatus } from '@/lib/comfyui-gallery-types';
import type { DaySlotStillStatus } from '@/lib/day-planner';

export type DaySlotJobEntry = {
  status?: ComfyGalleryJobStatus;
  /** 1-based pending position; 0 = running now. */
  queuePosition?: number | null;
  progressValue?: number;
  progressMax?: number;
};

export type DaySlotJobProgress = {
  phase: 'waiting' | 'rendering';
  label: string;
  /** 0–100 while the sampler reports steps, else null. */
  percent: number | null;
};

export function daySlotJobProgress(input: {
  stillStatus?: DaySlotStillStatus;
  entry?: DaySlotJobEntry | null;
  /** A live preview frame arrived — ComfyUI is on it even if no status says so yet. */
  livePreview?: boolean;
}): DaySlotJobProgress | null {
  const { stillStatus, entry } = input;
  if (stillStatus !== 'queued' && stillStatus !== 'running') {
    return null;
  }
  const rendering =
    stillStatus === 'running' ||
    entry?.status === 'running' ||
    entry?.queuePosition === 0 ||
    input.livePreview === true;
  if (rendering) {
    const max = entry?.progressMax ?? 0;
    const value = entry?.progressValue ?? 0;
    const percent = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : null;
    return {
      phase: 'rendering',
      label: percent === null ? 'Rendering…' : `Rendering · ${percent}%`,
      percent,
    };
  }
  const position = entry?.queuePosition ?? null;
  if (position !== null && position > 0) {
    return {
      phase: 'waiting',
      label: position === 1 ? 'Next in queue' : `#${position} in queue`,
      percent: null,
    };
  }
  return { phase: 'waiting', label: 'Queueing…', percent: null };
}
