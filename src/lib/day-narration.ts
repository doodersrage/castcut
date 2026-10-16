/**
 * Day narration on the cut's shots: each slot's voice-over (DaySlot.narration) on its shot, held
 * for the line (holdForNarration). Shared by Cut film and the Cut preview, so the preview plays
 * the narration the cut will have — lines already recorded (DaySlotStill.narrationUrl for the
 * same line) go straight on; the rest are listed for recording. Pure.
 */

import type { DaySlot, DaySlotStill } from './day-planner';
import type { FilmPlaylistShot } from './media-kind';
import { holdForNarration } from './story-film';

export type DayNarrationLine = { slotId: string; label: string; line: string };

export function applyDayNarration<T extends FilmPlaylistShot & { key?: string }>(
  shots: T[],
  slots: DaySlot[],
  stills: DaySlotStill[]
): { shots: T[]; missing: DayNarrationLine[] } {
  const missing: DayNarrationLine[] = [];
  const out = shots.map(shot => {
    const slot = slots.find(entry => entry.id === shot.key);
    const line = slot?.narration?.trim();
    if (!slot || !line) return shot;
    const still = stills.find(entry => entry.slotId === slot.id);
    const url = still?.narrationFor === line ? still.narrationUrl?.trim() : '';
    if (!url) {
      missing.push({ slotId: slot.id, label: slot.label, line });
      return shot;
    }
    return { ...holdForNarration(shot, line), narrationUrl: url, narrationText: line };
  });
  return { shots: out, missing };
}
