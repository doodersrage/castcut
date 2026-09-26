/**
 * Queue page context: what a job *is* (Day · Evening · Robin, Story · beat 3 "The letter"),
 * where to open it, which jobs came from one batch (Queue day, Retry flagged), and how to keep
 * a Day slot / Story beat pointing at a job that was resubmitted ("Run next"). Pure.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import type { DaySlot, DaySlotStill } from './day-planner';
import { galleryToolHrefForEntry, galleryToolLabel } from './gallery-tool-href';
import type { RoleplayStoryBeat } from './roleplay';

type PlayJobRef =
  | { tool: 'day'; slotLabel: string; kind: 'still' | 'clip' }
  | { tool: 'story'; index: number; title: string; kind: 'still' | 'clip'; retry: boolean };

/** Prompt id → the Day slot / Story beat it renders. */
export type PlayJobIndex = Map<string, PlayJobRef>;

export function buildPlayJobIndex(input: {
  daySlots?: DaySlot[];
  dayStills?: DaySlotStill[];
  story?: RoleplayStoryBeat[];
}): PlayJobIndex {
  const index: PlayJobIndex = new Map();
  const labels = new Map((input.daySlots ?? []).map(slot => [slot.id, slot.label]));
  for (const still of input.dayStills ?? []) {
    const slotLabel = labels.get(still.slotId) ?? still.slotId;
    if (still.promptId?.trim())
      index.set(still.promptId.trim(), { tool: 'day', slotLabel, kind: 'still' });
    if (still.clipPromptId?.trim()) {
      index.set(still.clipPromptId.trim(), { tool: 'day', slotLabel, kind: 'clip' });
    }
  }
  (input.story ?? []).forEach((beat, beatIndex) => {
    const title = beat.title?.trim() || 'Beat';
    const takes = beat.stillTakes ?? [];
    takes.forEach((take, takeIndex) => {
      const id = take.promptId?.trim();
      if (id)
        index.set(id, {
          tool: 'story',
          index: beatIndex,
          title,
          kind: 'still',
          retry: takeIndex > 0,
        });
    });
    if (beat.promptId?.trim() && !index.has(beat.promptId.trim())) {
      index.set(beat.promptId.trim(), {
        tool: 'story',
        index: beatIndex,
        title,
        kind: 'still',
        retry: takes.length > 1,
      });
    }
    for (const take of beat.clipTakes ?? []) {
      const id = take.clipPromptId?.trim();
      if (id) index.set(id, { tool: 'story', index: beatIndex, title, kind: 'clip', retry: false });
    }
    if (beat.clipPromptId?.trim() && !index.has(beat.clipPromptId.trim())) {
      index.set(beat.clipPromptId.trim(), {
        tool: 'story',
        index: beatIndex,
        title,
        kind: 'clip',
        retry: false,
      });
    }
  });
  return index;
}

export type QueueJobLabel = {
  /** "Day · Evening · Robin", "Story · beat 3 “The letter” · retry", "Refine · Robin". */
  label: string;
  /** Where to open it (the tool, on its Cast). */
  href: string;
  openLabel: string;
  /** Source kind for batching: day / story / the tool id. */
  source: string;
};

export function describeQueueJob(
  entry: Pick<ComfyGalleryEntry, 'promptId' | 'tool' | 'characterId'>,
  index: PlayJobIndex,
  castName?: string | null
): QueueJobLabel {
  const ref = entry.promptId ? index.get(entry.promptId.trim()) : undefined;
  const cast = castName?.trim();
  const href = galleryToolHrefForEntry({
    tool: ref?.tool === 'day' ? 'day' : ref?.tool === 'story' ? 'roleplay' : entry.tool,
    characterId: entry.characterId,
  });
  if (ref?.tool === 'day') {
    return {
      label: ['Day', ref.slotLabel, ref.kind === 'clip' ? 'clip' : null, cast]
        .filter(Boolean)
        .join(' · '),
      href,
      openLabel: 'Open in Day',
      source: 'day',
    };
  }
  if (ref?.tool === 'story') {
    return {
      label: [
        'Story',
        `beat ${ref.index + 1} “${ref.title}”`,
        ref.kind === 'clip' ? 'clip' : ref.retry ? 'retry' : null,
        cast,
      ]
        .filter(Boolean)
        .join(' · '),
      href,
      openLabel: 'Open in Story',
      source: 'story',
    };
  }
  const tool = galleryToolLabel(entry.tool);
  return {
    label: [tool, cast].filter(Boolean).join(' · '),
    href,
    openLabel: `Open in ${tool}`,
    source: entry.tool?.trim() || 'generate',
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
 * After a job is resubmitted under a new prompt id, point the Day slot / Story beat that was
 * waiting on it at the new id. Returns null when nothing referenced the old id.
 */
export function repointPlayJobIds(input: {
  dayStills?: DaySlotStill[];
  story?: RoleplayStoryBeat[];
  from: string;
  to: string;
}): { dayStills?: DaySlotStill[]; story?: RoleplayStoryBeat[] } | null {
  const { from, to } = input;
  let changed = false;
  const swap = (value: string | undefined) => {
    if (value?.trim() === from) {
      changed = true;
      return to;
    }
    return value;
  };
  const dayStills = input.dayStills?.map(still => ({
    ...still,
    promptId: swap(still.promptId),
    clipPromptId: swap(still.clipPromptId),
  }));
  const story = input.story?.map(beat => ({
    ...beat,
    promptId: swap(beat.promptId),
    clipPromptId: swap(beat.clipPromptId),
    ...(beat.stillTakes
      ? { stillTakes: beat.stillTakes.map(take => ({ ...take, promptId: swap(take.promptId) })) }
      : {}),
    ...(beat.clipTakes
      ? {
          clipTakes: beat.clipTakes.map(take => ({
            ...take,
            clipPromptId: swap(take.clipPromptId),
          })),
        }
      : {}),
    ...(beat.poseGuideExpect?.promptId === from
      ? { poseGuideExpect: { ...beat.poseGuideExpect, promptId: to } }
      : {}),
  }));
  return changed ? { dayStills, story } : null;
}
