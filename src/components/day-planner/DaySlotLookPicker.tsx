'use client';

import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import { castLookPortraitTile, castPlateTiles } from '@/lib/character-plate-thumb';
import { activeLook, looksOf, type CharacterRecord } from '@/lib/character-os';
import type { DaySlot, DaySlotId } from '@/lib/day-planner';

/**
 * Which of the Cast's looks a Day slot is made in, picked by its plate: "Day's look" (the
 * default — the Cast's active look, chosen for the whole Day on the Look & clothing row), or one
 * look for this slot only — its plate, its
 * outfit and its dressed plate, without changing the active look (day-slot-look.ts). Shown only
 * for a Cast with more than one look.
 */
export default function DaySlotLookPicker({
  character,
  slot,
  disabled,
  updateSlot,
}: {
  character: CharacterRecord | null | undefined;
  slot: DaySlot;
  disabled?: boolean;
  updateSlot: (slotId: DaySlotId, patch: Partial<DaySlot>) => void;
}) {
  if (!character) return null;
  const looks = looksOf(character);
  if (looks.length < 2) return null;
  const tiles = castPlateTiles(character);
  const active = tiles.find(tile => tile.id === activeLook(character).id);
  // A look removed since it was picked: the slot follows the active look again.
  const value = looks.some(look => look.id === slot.lookId) ? (slot.lookId ?? '') : '';
  return (
    <div className="space-y-1" data-testid="day-slot-look">
      <p className="type-caption text-[var(--text-muted)]">Look · {slot.label}</p>
      <PortraitTileStrip
        label={`Look for ${slot.label}`}
        value={value}
        disabled={disabled}
        onChange={next =>
          updateSlot(slot.id, {
            lookId: next || undefined,
            // Picked by hand: a new Day-wide outfit leaves it (day-outfit-scope.ts).
            outfitByHand: next || (slot.outfitByHand && slot.wardrobeId) ? true : undefined,
          })
        }
        testIdPrefix="day-slot-look"
        tiles={[
          {
            id: '',
            label: "Day's look",
            title: active
              ? `The whole Day's look (now ${active.label}) — follows it when it changes`
              : "The whole Day's look",
            thumb: active?.thumb,
            caption: active?.label,
          },
          ...tiles.map(tile => castLookPortraitTile(tile, { placeholder: 'No plate' })),
        ]}
      />
    </div>
  );
}
