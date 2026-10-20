/**
 * How long a batch will take, said beside Queue the rest / Animate all before they are pressed
 * (roadmap review 2026-10-11, "resource planner"): how many renders, the typical time of one on
 * this machine (queue-eta: median of the last finished jobs of that kind), and when the batch
 * would be done behind what is already queued. Rough on purpose. Pure.
 */

import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';
import { filmMediaLooksVideo } from '../media/kind';
import { DEFAULT_RENDER_MS, estimateQueueEta, formatEta, typicalRenderMs } from '../queue/eta';

type StillLike = {
  slotId: string;
  status?: string;
  clipStatus?: string;
};

/** Slots a "Queue the rest" would render, and finished stills an "Animate all" would animate. */
export function dayBatchCounts(
  slots: ReadonlyArray<{ id: string }>,
  stills: ReadonlyArray<StillLike>
): { stills: number; clips: number } {
  const bySlot = new Map(stills.map(still => [still.slotId, still]));
  let toQueue = 0;
  let toAnimate = 0;
  for (const slot of slots) {
    const still = bySlot.get(slot.id);
    const status = still?.status;
    if (status !== 'completed' && status !== 'queued' && status !== 'running') toQueue += 1;
    if (
      status === 'completed' &&
      still?.clipStatus !== 'completed' &&
      still?.clipStatus !== 'queued' &&
      still?.clipStatus !== 'running'
    ) {
      toAnimate += 1;
    }
  }
  return { stills: toQueue, clips: toAnimate };
}

type Timed = Pick<
  ComfyGalleryEntry,
  'model' | 'renderDurationMs' | 'completedAt' | 'status' | 'images' | 'derivedKind'
> &
  Partial<Pick<ComfyGalleryEntry, 'sourceImageUrl' | 'tool'>>;

type Active = Parameters<typeof estimateQueueEta>[0][number];

/**
 * "2 stills · ~1 min each · done in ~3 min (1 job ahead)". Null when there is nothing to do.
 * Clips are timed from finished clips only (they take minutes, stills seconds).
 */
export function batchTimeLine(input: {
  count: number;
  kind: 'still' | 'clip';
  completed: Timed[];
  active: Active[];
  /** The still model (checkpoint) Day queues with, for its own typical time. */
  model?: string;
}): string | null {
  if (input.count <= 0) return null;
  const ofKind = input.completed.filter(entry =>
    input.kind === 'clip'
      ? filmMediaLooksVideo(entry as never) && entry.derivedKind !== 'film'
      : !filmMediaLooksVideo(entry as never)
  );
  const timed = ofKind.some(entry => (entry.renderDurationMs ?? 0) > 0);
  const each = timed
    ? typicalRenderMs(ofKind, input.kind === 'still' ? input.model : undefined)
    : null;
  const ahead = estimateQueueEta(input.active, input.completed);
  const noun = input.kind === 'clip' ? 'clip' : 'still';
  const parts = [`${input.count} ${noun}${input.count === 1 ? '' : 's'}`];
  if (each) {
    parts.push(`${formatEta(each / 1000)} each`);
    const doneSec = ahead.totalSec + (each / 1000) * input.count;
    parts.push(`done in ${formatEta(doneSec)}`);
  } else {
    parts.push(`no ${noun} timed on this machine yet`);
  }
  if (input.active.length > 0) {
    parts.push(
      `${input.active.length} job${input.active.length === 1 ? '' : 's'} ahead${
        ahead.totalSec > 0 && !ahead.guess ? ` (${formatEta(ahead.totalSec)})` : ''
      }`
    );
  }
  return parts.join(' · ');
}

export { DEFAULT_RENDER_MS };
