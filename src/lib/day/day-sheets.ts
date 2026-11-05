/**
 * A Day as production sheets (print-sheets.ts): its storyboard — each slot's still with its beat,
 * line, camera and story state — and its call sheet — one row a slot, where, who, wearing what,
 * the camera, and whether it is shot. Pure: the page gives it the outfit names and the Cast.
 */

import type { CallSheetRow, StoryboardFrame } from '../print/print-sheets';
import { cameraChoiceSummary } from '../pose/camera-shot';
import { dayStillShownImage, type DaySlot, type DaySlotStill } from './planner';

/** What a slot's state says, in a few words: "carries the red umbrella · wet hair · anxious". */
function stateWords(slot: DaySlot): string {
  const state = slot.state;
  if (!state) return '';
  return [
    ...(state.carries ?? []).map(item => `carries ${item.text}`),
    ...(state.changes ?? []).map(item => item.text),
    state.emotion ?? '',
    state.storyDay ? `day ${state.storyDay}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function stillState(still: DaySlotStill | undefined): string {
  if (!still) return 'Not shot';
  if (still.clipStatus === 'completed' && still.clipUrl?.trim()) return 'Still + clip';
  if (still.status === 'completed') return 'Still';
  if (still.status === 'error') return 'Failed';
  if (still.status) return 'Rendering';
  return 'Not shot';
}

export type DaySheetInput = {
  slots: readonly DaySlot[];
  stills: readonly DaySlotStill[];
  /** The lead's name, and the names of the Cast a slot can add (by id). */
  lead?: string;
  castNames?: Readonly<Record<string, string>>;
  /** An outfit's name from its id (the clothing catalogue). */
  outfitName?: (id: string) => string;
};

/** The Day's storyboard frames, in slot order. */
export function dayStoryboardFrames(input: DaySheetInput): StoryboardFrame[] {
  return input.slots.map((slot, index) => {
    const still = input.stills.find(entry => entry.slotId === slot.id);
    return {
      number: String(index + 1),
      image: dayStillShownImage(still) || undefined,
      heading: [slot.label, slot.location].filter(Boolean).join(' — '),
      notes: [
        ['Beat', slot.sceneHints],
        [
          'Line',
          slot.line ? `“${slot.line}”${slot.replyLine ? ` / “${slot.replyLine}”` : ''}` : '',
        ],
        ['Narration', slot.narration],
        ['Camera', cameraChoiceSummary(slot.poseCamera)],
        ['State', stateWords(slot)],
      ],
    };
  });
}

/** The Day's call sheet rows, in slot order. */
export function dayCallSheetRows(input: DaySheetInput): CallSheetRow[] {
  return input.slots.map((slot, index) => {
    const still = input.stills.find(entry => entry.slotId === slot.id);
    const others = [slot.thirdCastId, slot.fourthCastId]
      .map(id => (id ? input.castNames?.[id] : ''))
      .filter(Boolean);
    return {
      number: String(index + 1),
      when: slot.label,
      place: slot.location,
      cast: [input.lead, ...others].filter(Boolean).join(', '),
      beat: [slot.sceneHints, stateWords(slot)].filter(Boolean).join(' — '),
      line: slot.line,
      outfit: slot.wardrobeId ? (input.outfitName?.(slot.wardrobeId) ?? slot.wardrobeId) : '',
      camera: cameraChoiceSummary(slot.poseCamera),
      status: stillState(still),
      thumb: dayStillShownImage(still) || undefined,
    };
  });
}
