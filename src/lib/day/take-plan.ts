/**
 * A take's plan (FINISHING_PLAN Phase 3, step 4): the decisions the take builder (queueSlot, in
 * useDayPlannerToolOrchestrationCore.ts) makes before it does anything — taken out of the hook one
 * at a time, as pure functions, so the server can make the same decisions without a page. Each
 * piece is moved as it was; the golden take requests (e2e/golden/take-requests/) check that what a
 * take sends ComfyUI doesn't change.
 */
import {
  dayMoodWantsAutoKit,
  dayOutfitArcKit,
  pickDayAutoKit,
  scriptSceneOutfitKit,
  type DayAutoKitOption,
} from './auto-kit';
import type { DaySlot } from './planner';

/** A Scene as the outfit choice reads it (scriptSceneOutfitKit). */
type OutfitScene = Parameters<typeof scriptSceneOutfitKit>[0][number];

export type TakeOutfitPlan = {
  /** The kit the take wears, if any. */
  wardrobeId?: string;
  /** The slot as the take renders it: its kit cleared when not the lead's, or the one picked. */
  target: DaySlot;
  /** A kit picked here (auto): the caller saves it on the slot. */
  picked?: string;
};

/**
 * The take's outfit: the slot's kit or the locked one — a kit not in the lead's catalog cleared
 * (another lead's) — and, with nothing dressing her and a mood that wants one, a kit picked: the
 * one the script's other Scenes wear at this time of day, else the Day's outfit arc, else one of
 * the catalog's for this slot.
 */
export function planTakeOutfit(input: {
  target: DaySlot;
  lockedWardrobeId?: string;
  /** The lead's catalog (empty before it loads: no kit is then judged not the lead's). */
  catalog: ReadonlyArray<DayAutoKitOption>;
  lookHasPlate: boolean;
  /** Where the look's plate came from ('keeper' — a Keep — is dressed already). */
  plateSource?: string;
  /** A clothing photo of her own is picked. */
  customGarment: boolean;
  dayMood: Parameters<typeof dayMoodWantsAutoKit>[0];
  /** A script's Scene: its script's other Scenes, and which one is open. */
  scene?: { scenes: ReadonlyArray<OutfitScene>; activeSceneId?: string | null };
  /** The board as the take builder has it, and its latest copy (a kit picked earlier this Queue). */
  workingSlots: ReadonlyArray<DaySlot>;
  latestSlots: ReadonlyArray<DaySlot>;
  /** Varies the pick between Casts (the Cast id). */
  salt?: string;
  hasPackshot: (wardrobeId: string) => boolean;
}): TakeOutfitPlan {
  let target = input.target;
  const locked = input.lockedWardrobeId?.trim() || undefined;
  let wardrobeId = target.wardrobeId?.trim() || locked;
  // The catalog list is filtered to the lead's gender, and the kit picker only offers what is in
  // it — a slot kit missing from it was left by another lead (a man in cocktail dresses, live
  // 2026-09-30). Treat it as unset.
  const catalogLoaded = input.catalog.some(option => option.value);
  const fitsLead = (id: string | undefined) =>
    !id?.trim() || !catalogLoaded || input.catalog.some(option => option.value === id);
  if (target.wardrobeId && !fitsLead(target.wardrobeId)) {
    target = { ...target, wardrobeId: undefined, wardrobeAuto: undefined };
    wardrobeId = locked;
  }
  // An auto-picked kit (not one the player chose) follows the outfit arc too.
  const autoKit = !target.wardrobeId?.trim() || target.wardrobeAuto === true;
  if (
    !autoKit ||
    locked ||
    !input.lookHasPlate ||
    input.plateSource === 'keeper' ||
    input.customGarment ||
    !dayMoodWantsAutoKit(input.dayMood)
  )
    return { wardrobeId, target };
  // Outfit arc: morning and afternoon share one outfit, evening and night another. A kit an
  // earlier slot picked in this same Queue day is only in the latest slots.
  const arcSlots = input.workingSlots.map(entry =>
    entry.wardrobeId?.trim()
      ? entry
      : (input.latestSlots.find(latest => latest.id === entry.id) ?? entry)
  );
  // A script's Scene: the outfit its script's other Scenes already wear at this time of day
  // (each Scene renders alone, so Day's arc can't see them).
  const scriptKit = input.scene
    ? scriptSceneOutfitKit(input.scene.scenes, input.scene.activeSceneId, input.dayMood, id =>
        fitsLead(id)
      )
    : undefined;
  const arcKit =
    scriptKit ??
    dayOutfitArcKit(
      arcSlots.filter(entry => fitsLead(entry.wardrobeId)),
      target.id,
      input.dayMood
    );
  const picked =
    arcKit ??
    (wardrobeId ||
      pickDayAutoKit({
        options: [...input.catalog],
        dayMood: input.dayMood,
        slotId: target.id,
        salt: input.salt,
        hasPackshot: input.hasPackshot,
        exclude: input.workingSlots.map(entry => entry.wardrobeId),
      }));
  if (!picked || (picked === target.wardrobeId && target.wardrobeAuto))
    return { wardrobeId, target };
  return {
    wardrobeId: picked,
    target: { ...target, wardrobeId: picked, wardrobeAuto: true },
    picked,
  };
}
