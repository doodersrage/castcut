/**
 * Tomorrow: the thread between one Cast's Days. Each cut Day is already an episode of the Cast's
 * season (play-series.ts) — but the next Day was planned from scratch, so a season read as
 * unrelated days. The thread remembers the run's idea and the last Day's beats, and Tomorrow
 * writes the next Day to follow on from them (day-premise.ts). Lives on the Day settings and
 * parks with the Cast (day-cast-park.ts).
 */

import {
  diversifyDaySlotScenes,
  rerollDaySlotScene,
  type DayIntimateMix,
  type DayMoodSetting,
  type DaySlot,
} from '@/lib/day-planner';
import { dayPartOf } from '@/lib/day-parts';
import { applyDayPremiseBeats, type DayPremiseBeat } from '@/lib/day-premise';

export type DayThread = {
  /** The idea this run follows ("Day from an idea"), if the player wrote one. */
  premise?: string;
  /** The previous Day's beats, "morning: …". */
  yesterday?: string[];
};

export function normalizeDayThread(value: unknown): DayThread | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const premise = typeof record.premise === 'string' ? record.premise.trim().slice(0, 240) : '';
  const yesterday = Array.isArray(record.yesterday)
    ? record.yesterday
        .filter((beat): beat is string => typeof beat === 'string' && Boolean(beat.trim()))
        .map(beat => beat.trim().slice(0, 260))
        .slice(0, 8)
    : [];
  if (!premise && yesterday.length === 0) return undefined;
  return { ...(premise ? { premise } : {}), ...(yesterday.length ? { yesterday } : {}) };
}

/** A Day's beats, as tomorrow's "yesterday". */
export function dayThreadBeats(slots: DaySlot[]): string[] {
  return slots
    .map(slot => {
      const beat = slot.sceneHints?.replace(/\s+/g, ' ').trim();
      return beat ? `${dayPartOf(slot.id)}: ${beat.slice(0, 240)}` : '';
    })
    .filter(Boolean);
}

/** The thread after this Day: its beats become yesterday, the idea carries on. */
export function nextDayThread(current: unknown, slots: DaySlot[]): DayThread | undefined {
  return normalizeDayThread({ ...normalizeDayThread(current), yesterday: dayThreadBeats(slots) });
}

/** True when a beat repeats one of yesterday's (same words after the part label). */
export function repeatsYesterday(
  beat: string | null | undefined,
  yesterday: string[] = []
): boolean {
  const key = (beat ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!key) return false;
  return yesterday.some(
    entry =>
      entry
        .replace(/^[a-z]+:\s*/i, '')
        .trim()
        .toLowerCase() === key
  );
}

/**
 * Tomorrow's slots: the LLM's follow-on beats where it wrote them, Day's own fresh picks for the
 * rest (all of them when there are none — adult moods, LLM off). No slot keeps yesterday's beat.
 * Kits Day picked by itself are dropped so tomorrow is dressed afresh; chosen outfits stay.
 */
export function planTomorrowSlots(
  slots: DaySlot[],
  input: {
    beats?: DayPremiseBeat[] | null;
    yesterday?: string[];
    dayMood?: DayMoodSetting | string | null;
    intimateMix?: DayIntimateMix | string | null;
    allowCompanions?: boolean;
    random?: () => number;
  }
): DaySlot[] {
  const undressed = slots.map(slot =>
    slot.wardrobeAuto ? { ...slot, wardrobeId: undefined, wardrobeAuto: undefined } : slot
  );
  const written = new Set((input.beats ?? []).map(beat => beat.slotId));
  const options = {
    allowCompanions: input.allowCompanions === true,
    dayMood: input.dayMood,
    intimateMix: input.intimateMix,
    random: input.random,
  };
  let next =
    written.size > 0
      ? applyDayPremiseBeats(undressed, input.beats ?? [])
      : diversifyDaySlotScenes(undressed, {
          ...options,
          dayMood: options.dayMood as DayMoodSetting | undefined,
          intimateMix: options.intimateMix as DayIntimateMix | undefined,
          forceLocations: true,
          forceBeats: true,
          fillBeats: true,
        }).slots;
  const yesterday = input.yesterday ?? [];
  for (const slot of next) {
    if (written.has(slot.id)) continue;
    const stale = written.size > 0 || repeatsYesterday(slot.sceneHints, yesterday);
    if (!stale) continue;
    // A few tries: the pools are large, but a short mood pool can hand the same beat back.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      next = rerollDaySlotScene(next, slot.id, {
        ...options,
        rerollLocation: true,
        rerollBeat: true,
      }).slots;
      const beat = next.find(entry => entry.id === slot.id)?.sceneHints;
      if (!repeatsYesterday(beat, yesterday)) break;
    }
  }
  return next;
}
