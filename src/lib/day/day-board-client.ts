'use client';

/**
 * A Short's board as its short has it, for what reads a Short away from the board (Cut, Play's
 * pose targets and counts, a Cast's file, the writers that change its moments or park it): the
 * saved copy with its short's Scenes on it (dayBoardFromShort, step 4c). Read-only: nothing is
 * written here.
 */
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_SCENE_TOOL_CACHE,
  type DayToolCache,
} from '../play/settings';
import { loadToolSettings, saveToolSettings } from '../settings/cache';
import './day-board-store';
import { dayBoardFromShort } from './day-as-short';
import { normalizeSavedScenes, type SavedScene } from './scenes';

/** A Short as its short has it (a parked one keeps no link: as it is). */
export function shortBoardOf<T extends Parameters<typeof dayBoardFromShort>[0]>(
  day: T,
  scenes?: readonly SavedScene[]
): T {
  if (!day.shortLink?.scriptId) return day;
  return dayBoardFromShort(
    day,
    scenes ?? normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes)
  );
}

/** The open Short as its short has it. */
export function loadDayBoard(): DayToolCache {
  return shortBoardOf(loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE));
}

/**
 * Deleting a Scene that holds a moment of the open Short (Step 5f part 3b): the board stores
 * that moment slim — only its Scene says what it is — so it is kept whole first. Call before the
 * Scene goes; the returned save runs once it has (the card stays as it was, no longer a Scene's).
 */
export function keepShortCardOf(
  scene: Pick<SavedScene, 'castId' | 'fromDaySlot' | 'fromScript'>
): (() => void) | null {
  if (!scene.fromDaySlot || !scene.fromScript?.scriptId) return null;
  const board = loadDayBoard();
  const link = board.shortLink;
  if (link?.scriptId !== scene.fromScript.scriptId || link.castId !== scene.castId) return null;
  const { slots, shortLink } = board;
  return () => saveToolSettings('day', { slots, shortLink });
}
