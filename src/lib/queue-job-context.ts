/**
 * Queue page context: what a job *is* (Day · Evening · Robin, Story · beat 3 "The letter"),
 * where to open it, which jobs came from one batch (Queue day, Retry flagged), and how to keep
 * a Day slot / Story beat pointing at a job that was resubmitted ("Run next"). Pure.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { galleryToolHrefForEntry, galleryToolLabel } from './gallery-tool-href';

export type QueueJobLabel = {
  /** "Day · Evening · Robin", "Story · beat 3 “The letter” · retry", "Refine · Robin". */
  label: string;
  /** Where to open it (the tool, on its Cast). */
  href: string;
  openLabel: string;
  /** Source kind for batching: day / story / the tool id. */
  source: string;
};

/**
 * Day and Outfit stills are queued through the edit pipeline, so their gallery entry says
 * "image-prompt". Once a still is no longer in the current Day plan the Queue labelled it
 * "Image → Prompt" and linked there. The prompt says what it was.
 */
export function inferPlayToolFromPrompt(
  prompt: string | null | undefined
): 'day' | 'fitting' | null {
  const text = String(prompt ?? '');
  if (/Edit instruction for an outfit try-on/i.test(text)) return 'fitting';
  if (/Edit instruction for a Day still|\b(?:Day|Vacation|Suggestive) photo:/i.test(text)) {
    return 'day';
  }
  return null;
}

/** A feature's own label for a job it queued, or null (the generic label applies). */
export type QueueJobLabeller = (
  entry: Pick<ComfyGalleryEntry, 'promptId' | 'tool' | 'characterId'> & { prompt?: string },
  castName?: string | null
) => QueueJobLabel | null;

export function describeQueueJob(
  entry: Pick<ComfyGalleryEntry, 'promptId' | 'tool' | 'characterId'> & { prompt?: string },
  labeller: QueueJobLabeller | null | undefined,
  castName?: string | null
): QueueJobLabel {
  const own = labeller?.(entry, castName);
  if (own) return own;
  const cast = castName?.trim();
  const href = galleryToolHrefForEntry({ tool: entry.tool, characterId: entry.characterId });
  const inferred =
    entry.tool === 'image-prompt' || entry.tool === 'imagePrompt'
      ? inferPlayToolFromPrompt(entry.prompt)
      : null;
  const tool = galleryToolLabel(inferred ?? entry.tool);
  return {
    label: [tool, cast].filter(Boolean).join(' · '),
    href: inferred
      ? galleryToolHrefForEntry({ tool: inferred, characterId: entry.characterId })
      : href,
    openLabel: `Open in ${tool}`,
    source: inferred ?? (entry.tool?.trim() || 'generate'),
  };
}

export type QueueJobGroup<T> = {
  key: string;
  entries: T[];
  /** Set when the group is a batch (2+ jobs): "Day · 4 jobs". */
  batchLabel?: string;
};

/** Jobs queued within this long of the previous one, from the same place, form a batch. */
const BATCH_GAP_MS = 3 * 60_000;

/**
 * Group consecutive jobs (queue order) from the same source and Cast, each within 3 min of the
 * previous, into batches. Single jobs stay on their own.
 */
export function groupQueueJobs<
  T extends Pick<ComfyGalleryEntry, 'id' | 'queuedAt' | 'characterId'>,
>(entries: T[], sourceOf: (entry: T) => string): QueueJobGroup<T>[] {
  const sorted = [...entries].sort((a, b) => a.queuedAt - b.queuedAt);
  const groups: QueueJobGroup<T>[] = [];
  for (const entry of sorted) {
    const last = groups.at(-1);
    const tail = last?.entries.at(-1);
    if (
      last &&
      tail &&
      sourceOf(tail) === sourceOf(entry) &&
      (tail.characterId ?? '') === (entry.characterId ?? '') &&
      entry.queuedAt - tail.queuedAt <= BATCH_GAP_MS
    ) {
      last.entries.push(entry);
      continue;
    }
    groups.push({ key: entry.id, entries: [entry] });
  }
  return groups.map(group => {
    if (group.entries.length < 2) return group;
    const source = sourceOf(group.entries[0]!);
    const name = source === 'day' ? 'Day' : source === 'story' ? 'Story' : galleryToolLabel(source);
    return { ...group, batchLabel: `${name} · ${group.entries.length} jobs` };
  });
}

/**
 * Features that know which of their records a job renders (Play: Day slots, Story beats —
 * play-queue-jobs.ts) label it on the Queue page and keep the record pointed at it after "Run
 * next" resubmits it. docs/architecture-boundaries.md.
 */
export type QueueJobDescriber = {
  /** Read the feature's records once per refresh; label the jobs among them. */
  labeller: () => QueueJobLabeller;
  /** A job was resubmitted as `to`: point whatever waited on `from` at it. */
  repoint: (from: string, to: string) => void;
};

const describers = new Map<string, QueueJobDescriber>();

export function registerQueueJobDescriber(id: string, describer: QueueJobDescriber): void {
  describers.set(id, describer);
}

/** Every feature's labeller, first match wins. */
export function queueJobLabeller(): QueueJobLabeller {
  const labellers = [...describers.values()].map(describer => describer.labeller());
  return (entry, castName) => {
    for (const labeller of labellers) {
      const label = labeller(entry, castName);
      if (label) return label;
    }
    return null;
  };
}

export function repointQueueJob(from: string, to: string): void {
  for (const describer of describers.values()) describer.repoint(from, to);
}
