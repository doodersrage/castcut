'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import type { DayToolCache } from '@/lib/play/settings';
import { pushAppToast } from '@/lib/app/toast';
import { dayPartOf, type DayPart } from '@/lib/day/parts';
import type { DaySlotId } from '@/lib/day/planner';
import {
  addScenePatch,
  createScene,
  deleteScenePatch,
  keepSceneTake,
  keptTakeOf,
  nextSceneName,
  normalizeSavedScenes,
  openScenePatch,
  recordSceneFromWorking,
  recordSceneJobs,
  removeSceneTake,
  sceneSlotAt,
  scenesForCast,
  swapSceneForCast,
  takeAsStill,
  upsertScene,
  type SavedScene,
  type SceneTake,
  type SceneToolCache,
} from '@/lib/day/scenes';
import { dayPagePath, loadDayForScenes, sendSceneToDaySlot } from '@/lib/day/scene-links';
import { daySlotsForScene } from '@/lib/day/scenes';

type DayEngineView = ReturnType<typeof useDayPlannerToolOrchestration>;

/**
 * The Scene page's own state on top of Day's engine (run with the `scene` settings): the Cast's
 * saved scenes, the open one kept in step with what the engine holds (its shot as edited, the
 * takes that land), and the page's actions — new / open / rename / delete a scene, keep a take,
 * put the kept take on the card for Make it move, send the scene to a Day slot.
 */
export function useScenePage(vm: DayEngineView) {
  const { mounted, toolSettings, updateToolSettings, stillsRef, character, stills, slots } = vm;
  const cache = toolSettings as SceneToolCache;
  const castId = character?.id ?? '';
  const scenes = useMemo(() => normalizeSavedScenes(cache.scenes), [cache.scenes]);
  const castScenes = useMemo(() => scenesForCast(scenes, castId), [castId, scenes]);
  const active =
    scenes.find(scene => scene.id === cache.activeSceneId && scene.castId === castId) ?? null;
  const slot = slots[0]!;
  const still = stills.find(entry => entry.slotId === slot.id);
  const inFlight = still?.status === 'queued' || still?.status === 'running';
  const stillPromptId = still?.promptId;
  const [note, setNote] = useState<string | null>(null);

  const write = useCallback(
    (patch: Partial<SceneToolCache>) => {
      if (patch.stills) stillsRef.current = patch.stills;
      updateToolSettings(patch as Partial<DayToolCache>);
    },
    [stillsRef, updateToolSettings]
  );

  // The open scene belongs to the active Cast: another Cast's scene (the Cast changed on another
  // page) is saved and this Cast's newest opens; none → the page offers New scene.
  useEffect(() => {
    if (!mounted || !castId) return;
    const open = scenes.find(scene => scene.id === cache.activeSceneId);
    const mismatch = cache.activeSceneId ? !open || open.castId !== castId : castScenes.length > 0;
    if (mismatch) write(swapSceneForCast({ ...cache, scenes }, castId));
  }, [cache, castId, castScenes.length, mounted, scenes, write]);

  // Keep the open scene in step with the engine: the shot as edited, the mood, takes that land.
  useEffect(() => {
    if (!mounted || !active) return;
    const next = recordSceneFromWorking(active, cache);
    // The jobs it queues, by id: the Queue page labels them "Scene" (their prompt says Day).
    const jobLog = recordSceneJobs(cache.jobLog, still, active.name);
    if (next !== active || jobLog !== cache.jobLog) {
      write({
        ...(next !== active ? { scenes: upsertScene(scenes, next) } : {}),
        ...(jobLog !== cache.jobLog ? { jobLog } : {}),
      });
    }
  }, [active, cache, mounted, scenes, still, write]);

  const newScene = useCallback(() => {
    if (!castId) return;
    // A new scene starts from the page's mood and people (the shot itself empty).
    const scene = createScene({
      castId,
      name: nextSceneName(scenes, castId),
      mood: cache as Record<string, unknown>,
    });
    write(addScenePatch({ ...cache, scenes }, scene));
    setNote(null);
  }, [cache, castId, scenes, write]);

  const openScene = useCallback(
    (sceneId: string) => {
      if (inFlight) {
        setNote('A take is rendering — open another scene when it lands.');
        return;
      }
      const patch = openScenePatch({ ...cache, scenes }, sceneId);
      if (patch) write(patch);
      setNote(null);
    },
    [cache, inFlight, scenes, write]
  );

  const renameScene = useCallback(
    (sceneId: string, name: string) => {
      const scene = scenes.find(entry => entry.id === sceneId);
      const clean = name.trim().slice(0, 60);
      if (!scene || !clean || clean === scene.name) return;
      write({ scenes: upsertScene(scenes, { ...scene, name: clean, updatedAt: Date.now() }) });
    },
    [scenes, write]
  );

  const deleteScene = useCallback(
    (sceneId: string) => {
      write(deleteScenePatch({ ...cache, scenes }, sceneId));
      setNote(null);
    },
    [cache, scenes, write]
  );

  /** Its time of day (the slot id): the still goes with the slot. */
  const setTimeOfDay = useCallback(
    (part: DayPart) => {
      if (dayPartOf(slot.id) === part && !slot.id.includes('-')) return;
      const nextSlot = sceneSlotAt(slot, part as DaySlotId);
      const moved = still ? [{ ...still, slotId: nextSlot.id }] : [];
      write({ slots: [nextSlot], stills: moved });
    },
    [slot, still, write]
  );

  /** A take on the card (what Make it move and the ⋯ tools work on). */
  const showTake = useCallback(
    (take: SceneTake): boolean => {
      if (stillPromptId && stillPromptId === take.promptId) return true;
      if (inFlight) {
        setNote('A take is rendering — wait for it to land first.');
        return false;
      }
      write({ stills: [takeAsStill(slot.id, take)] });
      return true;
    },
    [inFlight, slot.id, stillPromptId, write]
  );

  const keepTake = useCallback(
    (takeId: string) => {
      if (!active) return;
      const next = keepSceneTake(active, takeId);
      const kept = keptTakeOf(next);
      // The kept take goes on the card (unless one is rendering: then it waits).
      const onCard = kept && !inFlight && stillPromptId !== kept.promptId;
      write({
        scenes: upsertScene(scenes, next),
        ...(onCard ? { stills: [takeAsStill(slot.id, kept)] } : {}),
      });
    },
    [active, inFlight, scenes, slot.id, stillPromptId, write]
  );

  const removeTake = useCallback(
    (takeId: string) => {
      if (!active) return;
      write({ scenes: upsertScene(scenes, removeSceneTake(active, takeId)) });
    },
    [active, scenes, write]
  );

  /** Make it move starts from the kept take: put it on the card first. */
  const keptOnCard = useCallback((): boolean => {
    const kept = keptTakeOf(active);
    if (!kept) {
      setNote('Keep a take first (★) — Make it move starts from the kept take.');
      return false;
    }
    return showTake(kept);
  }, [active, showTake]);

  // Send to Day slot: the Cast's Day (live or parked) and its slots, read when asked.
  const [daySlots, setDaySlots] = useState<ReturnType<typeof daySlotsForScene>>([]);
  const refreshDaySlots = useCallback(() => {
    setDaySlots(
      castId ? daySlotsForScene(loadDayForScenes(), castId, vm.shared.activeCharacterId ?? '') : []
    );
  }, [castId, vm.shared.activeCharacterId]);
  const sendToDay = useCallback(
    (slotId: DaySlotId) => {
      if (!active) return;
      const error = sendSceneToDaySlot({
        scene: active,
        slotId,
        activeCastId: vm.shared.activeCharacterId ?? '',
      });
      if (error) {
        setNote(error);
        return;
      }
      const label = daySlots.find(entry => entry.id === slotId)?.label ?? slotId;
      setNote(null);
      pushAppToast({
        text: `${active.name} is on Day's ${label}${keptTakeOf(active) ? ' with its kept take' : ''}.`,
        tone: 'success',
        href: dayPagePath(),
      });
    },
    [active, daySlots, vm.shared.activeCharacterId]
  );

  return {
    scenes,
    castScenes,
    active,
    slot,
    still,
    inFlight,
    kept: keptTakeOf(active),
    note,
    setNote,
    newScene,
    openScene,
    renameScene,
    deleteScene,
    setTimeOfDay,
    showTake,
    keepTake,
    removeTake,
    keptOnCard,
    daySlots,
    refreshDaySlots,
    sendToDay,
  };
}

export type ScenePageState = ReturnType<typeof useScenePage>;
export type { SavedScene };
