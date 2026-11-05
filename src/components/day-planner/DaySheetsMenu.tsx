'use client';

import ActionMenu, { ACTION_MENU_ITEM_CLASS } from '@/components/ui/ActionMenu';
import { getCharacter, type CharacterRecord } from '@/lib/character/os';
import { dayCallSheetRows, dayStoryboardFrames, type DaySheetInput } from '@/lib/day/day-sheets';
import type { DaySlot, DaySlotStill } from '@/lib/day/planner';
import { callSheetHtml, storyboardHtml } from '@/lib/print/print-sheets';
import { openPrintSheet } from '@/lib/print/print-sheets-client';
import { getCachedClothingLabel, humanizeClothingId } from '@/lib/wardrobe/clothing-catalog-client';

/**
 * Day → Sheets: the day as a storyboard (each slot's still, beat, line, camera) and as a call
 * sheet (one row a slot: where, who, wearing, camera, shot or not) — a page each that prints or
 * saves as PDF.
 */
export default function DaySheetsMenu({
  character,
  slots,
  stills,
  moodLabel,
}: {
  character?: CharacterRecord | null;
  slots: readonly DaySlot[];
  stills: readonly DaySlotStill[];
  moodLabel?: string;
}) {
  const input = (): DaySheetInput => {
    const ids = slots.flatMap(slot => [slot.thirdCastId, slot.fourthCastId]).filter(Boolean);
    return {
      slots,
      stills,
      lead: character?.name,
      castNames: Object.fromEntries(
        ids.map(id => [id!, getCharacter(id)?.name ?? 'Another Cast member'])
      ),
      outfitName: id => getCachedClothingLabel(id) ?? humanizeClothingId(id),
    };
  };
  const title = character?.name ? `${character.name}'s day` : 'The day';
  const shot = stills.filter(still => still.status === 'completed').length;
  return (
    <ActionMenu label="Sheets" testId="day-sheets-menu">
      <button
        type="button"
        className={ACTION_MENU_ITEM_CLASS}
        disabled={slots.length === 0}
        data-testid="day-sheet-storyboard"
        title="Every slot's still with its beat, line and camera — a page to print or save as PDF"
        onClick={() =>
          openPrintSheet(
            storyboardHtml({
              title,
              subtitle: [moodLabel, `${shot} of ${slots.length} shot`].filter(Boolean).join(' · '),
              frames: dayStoryboardFrames(input()),
              origin: window.location.origin,
            })
          )
        }
      >
        Storyboard
      </button>
      <button
        type="button"
        className={ACTION_MENU_ITEM_CLASS}
        disabled={slots.length === 0}
        data-testid="day-sheet-call"
        title="One row a slot — where, who, wearing, camera, shot or not — to print or save as PDF"
        onClick={() =>
          openPrintSheet(
            callSheetHtml({
              title,
              subtitle: new Date().toLocaleDateString(),
              facts: [
                ['Cast', character?.name],
                ['Mood', moodLabel],
                ['Shots', `${slots.length} (${shot} shot)`],
              ],
              rows: dayCallSheetRows(input()),
              origin: window.location.origin,
            })
          )
        }
      >
        Call sheet
      </button>
    </ActionMenu>
  );
}
