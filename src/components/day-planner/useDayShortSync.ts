'use client';

import { useEffect, useRef, useState } from 'react';
import type { CharacterRecord } from '@/lib/character/os';
import type { DayToolCache } from '@/lib/play/settings';
import { DEFAULT_SCENE_TOOL_CACHE } from '@/lib/play/settings';
import { loadToolSettings } from '@/lib/settings/cache';
import { normalizeSavedScenes } from '@/lib/day/scenes';
import { dayStillsCachePatch, type DaySlot, type DaySlotStill } from '@/lib/day/planner';
import { dayShortFingerprint, dayStillsFromShort } from '@/lib/day/day-as-short';
import { loadSceneScriptStore } from '@/lib/day/scene-script-store-client';
import { saveDayAsShort, type DayShortLink } from '@/lib/day/scene-links';

/** How long the board is left alone before its edits go into the short. */
const SYNC_AFTER_MS = 1500;

/**
 * The board on the script road (2026-11-06): a Day with a short and the short stay one.
 * - Short ← short: each moment's kept take on its Scene is the moment's still here (Make the
 *   short's renders on the board, its reel, Cut's Short source).
 * - Short → short: the board's edits (Suggest day, One event, a beat, a template) go into the
 *   short's Scenes a moment after the last one — until the script is changed on Scene, when it
 *   is Scene's: then nothing is written, and this says so.
 * - Every Short is a script (2026-11-08): a Day with no short for this Cast gets one at its
 *   first edit — what it held when the page opened is not an edit, so opening an old Day makes
 *   nothing; it links on its next change. Never drops another script to make room (said instead).
 */
export function useDayShortSync(input: {
  character: CharacterRecord | null | undefined;
  toolSettings: DayToolCache;
  slots: DaySlot[];
  stills: DaySlotStill[];
  link: DayShortLink | undefined;
  updateDay: (patch: Partial<DayToolCache>) => void;
}): { scriptName: string | null; scenesOwn: boolean; autoError: string | null } {
  const { character, toolSettings, slots, stills, link, updateDay } = input;
  const castId = character?.id ?? '';
  const scriptId = castId && link?.castId === castId ? link.scriptId : '';
  const [scenesOwn, setScenesOwn] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const script = scriptId
    ? loadSceneScriptStore().scripts.find(entry => entry.id === scriptId)
    : undefined;
  const day: DayToolCache = { ...toolSettings, slots, stills };
  // The latest of everything, for the timer (the page re-renders all the time while it renders;
  // the sync is started by what the short reads, not by every render).
  const latest = useRef({ day, link, updateDay, leadName: character?.name ?? '' });
  useEffect(() => {
    latest.current = { day, link, updateDay, leadName: character?.name ?? '' };
  });

  // Short ← short: the short's kept takes as the Day's stills.
  const stillsKey = JSON.stringify(
    stills.map(still => [still.slotId, still.promptId, still.status])
  );
  useEffect(() => {
    if (!script) return;
    const scenes = normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes);
    const { day: now, updateDay: update } = latest.current;
    const next = dayStillsFromShort(now, scenes, { castId, scriptId: script.id });
    if (next) update(dayStillsCachePatch(next, castId));
  }, [castId, script, stillsKey]);

  // Short → short: the board's edits, a moment after the last one.
  const fingerprint = script ? dayShortFingerprint(day) : '';
  const linkedFingerprint = link?.fingerprint ?? '';
  useEffect(() => {
    if (!script || !fingerprint || fingerprint === linkedFingerprint) return;
    const timer = window.setTimeout(() => {
      const { day: now, link: current, updateDay: update, leadName } = latest.current;
      if (!current) return;
      const result = saveDayAsShort({ day: now, castId, leadName, link: current });
      if ('link' in result) {
        setScenesOwn(false);
        update({ shortLink: result.link });
      } else if ('choose' in result) {
        // Changed on Scene: it is Scene's now — the board doesn't write over it.
        setScenesOwn(true);
      }
    }, SYNC_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [castId, fingerprint, linkedFingerprint, script]);

  // No short for this Cast yet: the board's first edit makes it (the Day as it was when the page
  // opened, or the Cast was picked, is the baseline — not an edit).
  const dayPrint = castId ? dayShortFingerprint(day) : '';
  // print null: this Cast had a short on this page that is gone now (Next short drops it as it
  // writes the next day) — whatever the board holds is new, and gets a short of its own.
  const [baseline, setBaseline] = useState<{ castId: string; print: string | null } | null>(null);
  if (script && castId && (baseline?.castId !== castId || baseline.print !== null)) {
    setBaseline({ castId, print: null });
  } else if (!script && castId && baseline?.castId !== castId) {
    setBaseline({ castId, print: dayPrint });
  }
  const edited =
    !script &&
    Boolean(castId && dayPrint) &&
    baseline?.castId === castId &&
    baseline.print !== dayPrint;
  useEffect(() => {
    if (!edited) return;
    const timer = window.setTimeout(() => {
      const { day: now, updateDay: update, leadName } = latest.current;
      const result = saveDayAsShort({ day: now, castId, leadName });
      if ('link' in result) {
        setAutoError(null);
        update({ shortLink: result.link });
      } else if ('error' in result && !/^Nothing to make/.test(result.error)) {
        setAutoError(result.error);
      }
    }, SYNC_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [castId, dayPrint, edited]);

  return { scriptName: script?.name ?? null, scenesOwn, autoError: script ? null : autoError };
}
