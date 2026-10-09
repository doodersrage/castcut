/**
 * Day slots and Story beats on the Queue page: which job renders which slot / beat (its label and
 * link), and keeping them pointed at a job "Run next" resubmitted. Registered by play-features.ts.
 */

import type { DaySlot, DaySlotStill } from './day-planner';
import type { RoleplayStoryBeat } from './roleplay';
import { galleryToolHrefForEntry } from './gallery-tool-href';
import type { QueueJobDescriber, QueueJobLabeller } from './queue-job-context';
import { loadSettingsCache, saveToolSettings } from './settings-cache';

export type PlayJobRef =
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

/** Labels for the jobs a Play index knows (Day · Evening · Robin; Story · beat 3 “…” · retry). */
export function playJobLabeller(index: PlayJobIndex): QueueJobLabeller {
  return (entry, castName) => {
    const ref = entry.promptId ? index.get(entry.promptId.trim()) : undefined;
    if (!ref) return null;
    const cast = castName?.trim();
    const href = galleryToolHrefForEntry({
      tool: ref.tool === 'day' ? 'day' : 'roleplay',
      characterId: entry.characterId,
    });
    if (ref.tool === 'day') {
      return {
        label: ['Day', ref.slotLabel, ref.kind === 'clip' ? 'clip' : null, cast]
          .filter(Boolean)
          .join(' · '),
        href,
        openLabel: 'Open in Day',
        source: 'day',
      };
    }
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
  };
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

export const PLAY_QUEUE_JOB_DESCRIBER: QueueJobDescriber = {
  labeller: () => {
    const tools = loadSettingsCache().tools;
    return playJobLabeller(
      buildPlayJobIndex({
        daySlots: tools.day?.slots,
        dayStills: tools.day?.stills,
        story: tools.roleplay?.story,
      })
    );
  },
  repoint: (from, to) => {
    const tools = loadSettingsCache().tools;
    const repointed = repointPlayJobIds({
      dayStills: tools.day?.stills,
      story: tools.roleplay?.story,
      from,
      to,
    });
    if (repointed?.dayStills) saveToolSettings('day', { stills: repointed.dayStills });
    if (repointed?.story) saveToolSettings('roleplay', { story: repointed.story });
  },
};
