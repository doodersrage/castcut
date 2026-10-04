'use client';

import { useCallback, useMemo } from 'react';
import { switchCastPlate } from '@/lib/cast-plate-switch';
import {
  activeLook,
  applyCharacterRecord,
  looksOf,
  type CharacterRecord,
} from '@/lib/character-os';
import {
  dayAfterOutfitHandoff,
  dayHandoffKeptSlotIds,
  daySlotDiffers,
  daySlotsThatDiffer,
  slotWithDayOutfit,
  slotsUsingDayOutfit,
  type DayWideOutfit,
} from '@/lib/day-outfit-scope';
import type { DaySlot, DaySlotId } from '@/lib/day-planner';
import { outfitPicks } from '@/lib/outfit-handoff';
import {
  DEFAULT_DAY_TOOL_CACHE,
  loadToolSettings,
  type DayToolCache,
  type SharedToolSettings,
} from '@/lib/settings-cache';

/**
 * One look and one clothing for the whole Day (day-outfit-scope.ts): what it is, which slots
 * differ, and the writes behind the Look & clothing row — choose the Day's look or kit, "Use for
 * every slot", a slot's "Use the Day's", and Outfit's hand-off notice.
 */
export function useDayOutfitScope({
  character,
  shared,
  toolSettings,
  slots,
  updateShared,
  updateToolSettings,
}: {
  character: CharacterRecord | null | undefined;
  shared: SharedToolSettings;
  toolSettings: DayToolCache;
  slots: DaySlot[];
  updateShared: (patch: Partial<SharedToolSettings>) => void;
  updateToolSettings: (patch: Partial<DayToolCache>) => void;
}) {
  const activeLookId = character ? activeLook(character).id : undefined;
  const lookIdsKey = character
    ? looksOf(character)
        .map(look => look.id)
        .join('\n')
    : '';
  const hasPhoto = Boolean(
    toolSettings.customGarmentImageUrl?.trim() || toolSettings.customGarmentImageFilename?.trim()
  );
  const kitId = shared.lockedWardrobeId?.trim() || undefined;
  const dayWide = useMemo<DayWideOutfit>(
    () => ({
      activeLookId,
      lookIds: lookIdsKey ? lookIdsKey.split('\n') : undefined,
      kitId,
      hasPhoto,
    }),
    [activeLookId, hasPhoto, kitId, lookIdsKey]
  );
  const differingSlotIds = useMemo(() => daySlotsThatDiffer(slots, dayWide), [dayWide, slots]);
  const handoffKeptSlotIds = useMemo(
    () => dayHandoffKeptSlotIds(toolSettings.outfitHandoffKept, slots, dayWide),
    [dayWide, slots, toolSettings.outfitHandoffKept]
  );

  /** "Use for every slot" — one write; also answers Outfit's notice. */
  const applyDayOutfitEverywhere = useCallback(() => {
    updateToolSettings({
      slots: slotsUsingDayOutfit(slots, dayWide),
      outfitHandoffKept: undefined,
    });
  }, [dayWide, slots, updateToolSettings]);

  /** Outfit's notice: "Use the new one everywhere" — the slots it lists. */
  const applyHandoffOutfitEverywhere = useCallback(() => {
    updateToolSettings({
      slots: slotsUsingDayOutfit(slots, dayWide, handoffKeptSlotIds),
      outfitHandoffKept: undefined,
    });
  }, [dayWide, handoffKeptSlotIds, slots, updateToolSettings]);

  const dismissHandoffNotice = useCallback(() => {
    updateToolSettings({ outfitHandoffKept: undefined });
  }, [updateToolSettings]);

  /** A slot's "Use the Day's". */
  const applyDayOutfitToSlot = useCallback(
    (slotId: DaySlotId) => {
      updateToolSettings({
        slots: slots.map(slot => (slot.id === slotId ? slotWithDayOutfit(slot) : slot)),
      });
    },
    [slots, updateToolSettings]
  );

  const slotDiffers = useCallback((slot: DaySlot) => daySlotDiffers(slot, dayWide), [dayWide]);

  /**
   * The Day's look: the Cast's active look, switched as on the Cast page (Outfit and Story
   * follow it). Day's slots follow too; hand-picked slot looks / kits stay, counted on the row.
   */
  const chooseDayLook = useCallback(
    (lookId: string) => {
      if (!character || !lookId || lookId === activeLookId) return;
      const next = switchCastPlate(character.id, lookId, { dayNotice: false });
      if (!next) return;
      updateShared({
        ...applyCharacterRecord(next),
        lockedWardrobeId: activeLook(next).lockedWardrobeId?.trim() || undefined,
      });
      // switchCastPlate wrote Day's saved settings (the look's photo / shoes, the slots); this
      // page's copy takes the same, so its next save does not put the old ones back.
      const saved = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
      updateToolSettings({
        slots: saved.slots,
        outfitHandoffKept: undefined,
        customGarmentImageUrl: saved.customGarmentImageUrl,
        customGarmentImageFilename: saved.customGarmentImageFilename,
        customGarmentDescription: saved.customGarmentDescription,
        footwear: saved.footwear,
        footwearImageUrl: saved.footwearImageUrl,
        footwearImageFilename: saved.footwearImageFilename,
      });
    },
    [activeLookId, character, updateShared, updateToolSettings]
  );

  /**
   * The Day's kit (the session's outfit lock; unset: Day picks one per slot). A kit turns the
   * clothing photo off. Slots follow: kits an earlier Day-wide choice or the auto arc left go,
   * hand-picked ones stay.
   */
  const selectDayWardrobe = useCallback(
    (wardrobeId: string | undefined) => {
      const id = wardrobeId?.trim() || undefined;
      const previousUrl = toolSettings.customGarmentImageUrl?.trim();
      if (id && previousUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previousUrl);
      }
      updateShared({ lockedWardrobeId: id });
      updateToolSettings(
        dayAfterOutfitHandoff(
          { ...toolSettings, slots },
          {
            ...(id
              ? {
                  picks: {
                    ...outfitPicks(toolSettings),
                    customGarmentImageUrl: undefined,
                    customGarmentImageFilename: undefined,
                    customGarmentDescription: undefined,
                  },
                }
              : {}),
            kitId: id,
            activeLookId,
            lookIds: dayWide.lookIds,
            at: Date.now(),
            notice: false,
          }
        )
      );
    },
    [activeLookId, dayWide.lookIds, slots, toolSettings, updateShared, updateToolSettings]
  );

  return {
    dayWideOutfit: dayWide,
    differingSlotIds,
    handoffKeptSlotIds,
    slotDiffers,
    applyDayOutfitEverywhere,
    applyHandoffOutfitEverywhere,
    dismissHandoffNotice,
    applyDayOutfitToSlot,
    chooseDayLook,
    selectDayWardrobe,
  };
}
