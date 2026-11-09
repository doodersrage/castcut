'use client';

import { useEffect, useRef, useState } from 'react';
import type { CharacterRecord } from '@/lib/character/os';
import type { DayToolCache } from '@/lib/play/settings';
import { DEFAULT_SCENE_TOOL_CACHE } from '@/lib/play/settings';
import { loadToolSettings, saveToolSettings } from '@/lib/settings/cache';
import { normalizeSavedScenes, upsertScene } from '@/lib/day/scenes';
import { addScriptPatch } from '@/lib/day/scene-scripts';
import { scriptsCacheOf } from '@/lib/day/scene-script-store';
import { shortCardsForScriptScenes } from '@/lib/day/short-cards';
import { dayStillsCachePatch, type DaySlot, type DaySlotStill } from '@/lib/day/planner';
import {
  dayMomentsFromShort,
  dayShortFingerprint,
  dayStillsFromShort,
} from '@/lib/day/day-as-short';
import { applySceneScriptsPatch, loadSceneScriptStore } from '@/lib/day/scene-script-store-client';
import { shortMomentsOf, shortSlotOrder } from '@/lib/day/short-moments';
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

  // Short ← short, the moments too (step 4b, 2026-11-08): the short is the record. When its
  // Scenes changed (a beat, a line, a time edited on Script or Scene) and the board has no edit
  // of its own waiting to go in, the board takes them. Its link's fingerprint moves with it, so
  // the board doesn't write them straight back. The script's own text changed on Script is left
  // as before (the board stops writing; asked when both changed) — its words aren't the Scenes'.
  const scenesStamp = script
    ? normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes)
        .filter(scene => scene.fromScript?.scriptId === script.id && scene.castId === castId)
        .map(scene => `${scene.id}:${scene.updatedAt}`)
        .join(',')
    : '';
  useEffect(() => {
    // No Scenes read (none yet, or not loaded): nothing to go by — every scene would look new.
    if (!script || !scenesStamp) return;
    const { day: now, link: current, updateDay: update } = latest.current;
    if (!current || dayShortFingerprint(now) !== current.fingerprint) return;
    // The script's text changed on Script since doesn't stop it (part 2b, 2026-11-09): the
    // Scenes still hold the moments — and a slim copy (slimDayBoard) holds nothing else.
    const sceneCache = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
    const scenes = normalizeSavedScenes(sceneCache.scenes);
    const moments = dayMomentsFromShort(now, scenes, { castId, scriptId: script.id });
    const pulled = moments ? { ...now, slots: moments } : now;
    // A scene added on Script gets its card (Step 5f part 2): an empty one, else one more. Its
    // Scene is tied to it (made when it has none) — the board then shows what that Scene holds.
    const added = shortCardsForScriptScenes({
      day: pulled,
      script,
      scenes,
      castId,
      leadName: latest.current.leadName,
    });
    if (added) {
      if (added.script !== script)
        applySceneScriptsPatch(
          addScriptPatch(scriptsCacheOf(loadSceneScriptStore()), added.script)
        );
      saveToolSettings('scene', {
        ...sceneCache,
        scenes: added.scenes.reduce((all, scene) => upsertScene(all, scene), scenes),
      });
    }
    if (!moments && !added) return;
    const next = added
      ? { ...pulled, slots: added.slots, dayLength: added.dayLength, slotOrder: added.slotOrder }
      : pulled;
    update({
      slots: next.slots,
      ...(added ? { dayLength: added.dayLength, slotOrder: added.slotOrder } : {}),
      shortLink: { ...current, fingerprint: dayShortFingerprint(next) },
    });
  }, [castId, scenesStamp, script]);

  // The board in its short's order (Step 5f, 2026-11-09): its cards as the script orders its
  // scenes — moved on Script, moved here. A card with no scene stays after the one it followed.
  const orderKey = slots.map(slot => slot.id).join(',');
  useEffect(() => {
    if (!script) return;
    const scenes = normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes);
    const ids = orderKey ? (orderKey.split(',') as DaySlot['id'][]) : [];
    const next = shortSlotOrder(ids, shortMomentsOf(script, scenes));
    if (next.join(',') !== orderKey) latest.current.updateDay({ slotOrder: next });
  }, [orderKey, scenesStamp, script]);

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
  // Step 4c (2026-11-08): every Short with moments has its short — one opened without one gets
  // it once (its Cast noted, so a short deleted on Script isn't made back by opening Short).
  // Only a Short that never had a short for this Cast: one linked to a short since deleted (or
  // whose script isn't here) is left as it is — an edit makes a new one.
  const linkedBefore =
    (toolSettings.shortLinkedFor ?? []).includes(castId) || link?.castId === castId;
  const firstOpen = !script && Boolean(castId && dayPrint) && !linkedBefore;
  const edited =
    firstOpen ||
    (!script &&
      Boolean(castId && dayPrint) &&
      baseline?.castId === castId &&
      baseline.print !== dayPrint);
  useEffect(() => {
    if (!edited) return;
    const timer = window.setTimeout(() => {
      const { day: now, updateDay: update, leadName } = latest.current;
      const result = saveDayAsShort({ day: now, castId, leadName });
      const noted = [...new Set([...(now.shortLinkedFor ?? []), castId])];
      if ('link' in result) {
        setAutoError(null);
        update({ shortLink: result.link, shortLinkedFor: noted });
      } else if ('error' in result && !/^Nothing to make/.test(result.error)) {
        setAutoError(result.error);
      } else {
        update({ shortLinkedFor: noted });
      }
    }, SYNC_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [castId, dayPrint, edited]);

  return { scriptName: script?.name ?? null, scenesOwn, autoError: script ? null : autoError };
}
