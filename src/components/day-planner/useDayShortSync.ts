'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CharacterRecord } from '@/lib/character/os';
import type { DayToolCache } from '@/lib/play/settings';
import { DEFAULT_SCENE_TOOL_CACHE } from '@/lib/play/settings';
import { loadToolSettings, saveToolSettings } from '@/lib/settings/cache';
import { normalizeSavedScenes, upsertScene } from '@/lib/day/scenes';
import { addScriptPatch } from '@/lib/day/scene-scripts';
import { scriptsCacheOf } from '@/lib/day/scene-script-store';
import { shortCardsForScriptScenes, shortCardsOfRemovedScenes } from '@/lib/day/short-cards';
import {
  DAY_LENGTH_MAX,
  dayStillsCachePatch,
  normalizeDaySlots,
  type DaySlot,
  type DaySlotStill,
} from '@/lib/day/planner';
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
}): {
  scriptName: string | null;
  scenesOwn: boolean;
  autoError: string | null;
  /** Scenes of the short with no card: the board is full (40 moments). */
  cardless: number;
} {
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
  // The board this last wrote, until the page has it: saving the Scenes runs this again, maybe
  // before that write is rendered — read from the old board, a card just emptied came back.
  const pulledRef = useRef<{ from: string; day: DayToolCache; link: DayShortLink } | null>(null);
  useEffect(() => {
    // No Scenes read (none yet, or not loaded): nothing to go by — every scene would look new.
    if (!script || !scenesStamp) return;
    const { updateDay: update } = latest.current;
    let { day: now, link: current } = latest.current;
    const pending = pulledRef.current;
    // What the page shows now (a write still on its way chains from it).
    const shown = current?.fingerprint ?? '';
    if (pending && shown === pending.from) {
      now = pending.day;
      current = pending.link;
    } else pulledRef.current = null;
    if (!current || dayShortFingerprint(now) !== current.fingerprint) return;
    // The script's text changed on Script since doesn't stop it (part 2b, 2026-11-09): the
    // Scenes still hold the moments — and a slim copy (slimDayBoard) holds nothing else.
    const sceneCache = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
    const stored = normalizeSavedScenes(sceneCache.scenes);
    // A scene removed on Script (2026-11-10): its card is emptied and its Scene untied from it,
    // or the board's next edit wrote the scene back. The Scene stays, with its takes.
    const cleared = shortCardsOfRemovedScenes({ day: now, script, scenes: stored, castId });
    const scenes = cleared
      ? cleared.scenes.reduce((all, scene) => upsertScene(all, scene), stored)
      : stored;
    const base = cleared ? { ...now, slots: cleared.slots, stills: cleared.stills } : now;
    const moments = dayMomentsFromShort(base, scenes, { castId, scriptId: script.id });
    const pulled = moments ? { ...base, slots: moments } : base;
    // A scene added on Script gets its card (Step 5f part 2): an empty one, else one more. Its
    // Scene is tied to it (made when it has none) — the board then shows what that Scene holds.
    const added = shortCardsForScriptScenes({
      day: pulled,
      script,
      scenes,
      castId,
      leadName: latest.current.leadName,
    });
    if (added && added.script !== script)
      applySceneScriptsPatch(addScriptPatch(scriptsCacheOf(loadSceneScriptStore()), added.script));
    if (cleared || added)
      saveToolSettings('scene', {
        ...sceneCache,
        scenes: (added?.scenes ?? []).reduce((all, scene) => upsertScene(all, scene), scenes),
      });
    if (!cleared && !moments && !added) return;
    const next = added
      ? { ...pulled, slots: added.slots, dayLength: added.dayLength, slotOrder: added.slotOrder }
      : pulled;
    const shortLink = { ...current, fingerprint: dayShortFingerprint(next) };
    if (shortLink.fingerprint !== current.fingerprint)
      pulledRef.current = { from: shown, day: next, link: shortLink };
    update({
      slots: next.slots,
      ...(cleared ? dayStillsCachePatch(next.stills ?? [], castId) : {}),
      ...(added ? { dayLength: added.dayLength, slotOrder: added.slotOrder } : {}),
      shortLink,
    });
  }, [castId, scenesStamp, script]);

  // Past the board's 40 moments a scene written on Script gets no card (2026-11-10): said, not
  // left silent. Below 40 the pull above gives it one.
  const full = normalizeDaySlots(slots, toolSettings.dayLength).length >= DAY_LENGTH_MAX;
  const cardless = useMemo(() => {
    if (!script || !full || !scenesStamp) return 0;
    const scenes = normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes);
    return shortMomentsOf(script, scenes).filter(moment => !moment.daySlot).length;
  }, [full, scenesStamp, script]);

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

  return {
    scriptName: script?.name ?? null,
    scenesOwn,
    autoError: script ? null : autoError,
    cardless,
  };
}
