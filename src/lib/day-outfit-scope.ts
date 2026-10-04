/**
 * One look and one clothing for the whole Day, and the slots that differ from it.
 *
 * The Day's look is the Cast's active look; its clothing is the session's outfit lock
 * (shared.lockedWardrobeId) or Day's clothing photo, with Day's shoes. A slot differs when it
 * names another of the Cast's looks (DaySlot.lookId) or a kit that is not the Day's
 * (DaySlot.wardrobeId).
 *
 * Who set a slot's own look or kit matters when the Day's outfit changes (Outfit's Keep, a kit or
 * look picked there, Use on Day, or a Day-wide choice on Day itself):
 * - set by hand in the slot sheet (`outfitByHand`, or a slot look — only the sheet sets one):
 *   kept, and listed so Day can say "2 slots keep their own outfit · Use the new one everywhere";
 * - set for the slot by an earlier Day-wide choice (a kit stamped on every slot by an older Keep
 *   or deep link, or the 'custom-garment' placeholder): cleared, so the new outfit is worn;
 * - auto-picked at queue time (`wardrobeAuto`, the outfit arc of an undressed Day): kept while
 *   the Day has no clothing of its own, cleared once it has.
 */
import type { DaySlot, DaySlotId } from './day-planner';
import {
  CUSTOM_GARMENT_WARDROBE_ID,
  keptOutfitHasPhoto,
  outfitHandoffPatch,
  type OutfitHandoffPatch,
  type OutfitPicks,
} from './outfit-handoff';

/** What the whole Day wears. */
export type DayWideOutfit = {
  /** The Cast's active look. */
  activeLookId?: string | null;
  /** The Cast's looks; a slot look not among them (removed since) does not count. */
  lookIds?: readonly string[] | null;
  /** The Day's kit (the session's outfit lock). */
  kitId?: string | null;
  /** Day's clothing photo is on — it turns kits off for the Day. */
  hasPhoto?: boolean;
};

type SlotOutfitFields = Pick<
  DaySlot,
  'id' | 'lookId' | 'wardrobeId' | 'wardrobeAuto' | 'outfitByHand'
>;

/** "Morning and Night keep their own outfit" — written by a hand-off, shown on Day. */
export type DayOutfitHandoffNotice = {
  slotIds: DaySlotId[];
  at: number;
};

function dayKit(day: DayWideOutfit): string {
  if (day.hasPhoto) return '';
  const id = day.kitId?.trim() || '';
  return id === CUSTOM_GARMENT_WARDROBE_ID ? '' : id;
}

/** The slot's own look, when it is one of the Cast's and not the Day's. */
export function daySlotOwnLook(
  slot: Pick<DaySlot, 'lookId'>,
  day: DayWideOutfit
): string | undefined {
  const id = slot.lookId?.trim();
  if (!id || id === day.activeLookId?.trim()) return undefined;
  if (day.lookIds && !day.lookIds.includes(id)) return undefined;
  return id;
}

/** The slot's own kit, when it is not the Day's (an auto pick on an undressed Day is the Day's). */
export function daySlotOwnKit(
  slot: Pick<DaySlot, 'wardrobeId' | 'wardrobeAuto'>,
  day: DayWideOutfit
): string | undefined {
  const id = slot.wardrobeId?.trim();
  if (!id || id === CUSTOM_GARMENT_WARDROBE_ID) return undefined;
  const kit = dayKit(day);
  if (id === kit) return undefined;
  if (slot.wardrobeAuto === true && !kit && !day.hasPhoto) return undefined;
  return id;
}

export function daySlotDiffers(
  slot: Pick<DaySlot, 'lookId' | 'wardrobeId' | 'wardrobeAuto'>,
  day: DayWideOutfit
): boolean {
  return Boolean(daySlotOwnLook(slot, day) || daySlotOwnKit(slot, day));
}

/** Ids of the slots whose look or clothing is not the Day's. */
export function daySlotsThatDiffer(
  slots: readonly SlotOutfitFields[],
  day: DayWideOutfit
): DaySlotId[] {
  return slots.filter(slot => daySlotDiffers(slot, day)).map(slot => slot.id);
}

/** The slot's own look / kit was picked in its sheet (a slot look is only ever picked there). */
export function daySlotSetByHand(slot: Pick<DaySlot, 'outfitByHand' | 'lookId'>): boolean {
  return slot.outfitByHand === true || Boolean(slot.lookId?.trim());
}

/** The slot back on the Day's look and clothing. */
export function slotWithDayOutfit<T extends SlotOutfitFields>(slot: T): T {
  return {
    ...slot,
    lookId: undefined,
    wardrobeId: undefined,
    wardrobeAuto: undefined,
    outfitByHand: undefined,
  };
}

/**
 * "Use for every slot": every slot that differs goes back to the Day's look and clothing (only
 * the ones in `onlyIds`, when given). Slots that already match are returned as they are.
 */
export function slotsUsingDayOutfit<T extends SlotOutfitFields>(
  slots: readonly T[],
  day: DayWideOutfit,
  onlyIds?: readonly DaySlotId[] | null
): T[] {
  return slots.map(slot =>
    (!onlyIds || onlyIds.includes(slot.id)) && daySlotDiffers(slot, day)
      ? slotWithDayOutfit(slot)
      : slot
  );
}

/**
 * The Day's outfit changed (`day` is the new one): overrides an earlier Day-wide choice left on
 * the slots are cleared, hand-set ones stay. `keptSlotIds`: the hand-set slots that now differ.
 */
export function slotsAfterDayOutfitChange<T extends SlotOutfitFields>(
  slots: readonly T[],
  day: DayWideOutfit
): { slots: T[]; keptSlotIds: DaySlotId[] } {
  const dressed = Boolean(dayKit(day) || day.hasPhoto);
  const keptSlotIds: DaySlotId[] = [];
  const next = slots.map(slot => {
    if (daySlotSetByHand(slot)) {
      if (daySlotDiffers(slot, day)) keptSlotIds.push(slot.id);
      return slot;
    }
    const kit = slot.wardrobeId?.trim();
    const keepAuto = slot.wardrobeAuto === true && !dressed && kit !== CUSTOM_GARMENT_WARDROBE_ID;
    if (!kit || keepAuto) {
      return slot.outfitByHand === undefined ? slot : { ...slot, outfitByHand: undefined };
    }
    return slotWithDayOutfit(slot);
  });
  return { slots: next, keptSlotIds };
}

/** Day's settings as the hand-off reads and writes them. */
export type DayOutfitSettings = OutfitPicks & {
  slots?: DaySlot[];
  outfitHandoffKept?: DayOutfitHandoffNotice;
};

export type DayOutfitHandoffPatch = Partial<OutfitHandoffPatch> & {
  slots: DaySlot[];
  outfitHandoffKept: DayOutfitHandoffNotice | undefined;
};

/**
 * What Day's settings take when Outfit hands over (Keep, a kit / photo / shoes / look picked
 * there, Use on Day): Outfit's clothing photo and shoes (`picks`; omitted — a kit or look change
 * only — they stay), the slots merged by {@link slotsAfterDayOutfitChange}, and the notice of
 * hand-set slots that keep their own outfit. `notice: false` (a choice made on Day itself, where
 * the Look & clothing row already counts them) clears it instead.
 */
export function dayAfterOutfitHandoff(
  day: DayOutfitSettings,
  input: {
    picks?: OutfitPicks | null;
    kitId?: string | null;
    activeLookId?: string | null;
    lookIds?: readonly string[] | null;
    at: number;
    notice?: boolean;
  }
): DayOutfitHandoffPatch {
  const patch: Partial<OutfitHandoffPatch> =
    input.picks === undefined ? {} : outfitHandoffPatch(input.picks);
  const hasPhoto = keptOutfitHasPhoto(input.picks === undefined ? day : patch);
  const merged = slotsAfterDayOutfitChange(day.slots ?? [], {
    activeLookId: input.activeLookId,
    lookIds: input.lookIds,
    kitId: input.kitId,
    hasPhoto,
  });
  return {
    ...patch,
    slots: merged.slots,
    outfitHandoffKept:
      input.notice !== false && merged.keptSlotIds.length > 0
        ? { slotIds: merged.keptSlotIds, at: input.at }
        : undefined,
  };
}

/** The notice's slots that still differ (one reset since, or the Day changed back: gone). */
export function dayHandoffKeptSlotIds(
  notice: DayOutfitHandoffNotice | null | undefined,
  slots: readonly SlotOutfitFields[],
  day: DayWideOutfit
): DaySlotId[] {
  if (!notice?.slotIds?.length) return [];
  return slots
    .filter(slot => notice.slotIds.includes(slot.id) && daySlotDiffers(slot, day))
    .map(slot => slot.id);
}
