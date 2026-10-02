/**
 * Which picture goes where on a Day still — the decisions `queueSlot`
 * (useDayPlannerToolOrchestrationCore) makes between its uploads and renders, as pure functions.
 * The hook calls them, and so does day-finished-prompt-sweep.test.ts: the sweep used to carry
 * its own copy of each rule, which could drift from the hook without a test noticing.
 */
import { dayDressPlateApplies } from './day-dress-plate';
import { isDayAdultMood, isDayHeatMood, normalizeDayMood } from './day-planner';
import {
  isClothingOnlyDayGarment,
  isDayVacationLightningIdentityVlModel,
  isQwenEdit2511PoseStickyModel,
} from './day-plate';
import { dayClothedHeatPoseNeedsBodyUnlock, daySuggestiveBeatIsSeated } from './day-vacation';
import { beatOwnsFootwear, footwearIsBarefoot } from './footwear';
import { poseProfileForModel } from './pose/pose-model-profile';
import { vacationBeatDressesItself } from './rapid-duo-recipe';

/** The mood a still plays as: an adult mood with Intimate off is Everyday. */
function playedMood(dayMood: string | null | undefined, intimateEnabled: boolean) {
  return isDayAdultMood(dayMood) && !intimateEnabled ? 'everyday' : dayMood;
}

/** A scene that brings its own clothes (the pool's swimsuit, a robe). */
function sceneDressesItself(dayMood: string | null | undefined, sceneHints: string | undefined) {
  return normalizeDayMood(dayMood) === 'vacation' && vacationBeatDressesItself(sceneHints);
}

/**
 * Whether this still starts from a dressed plate (the picked clothing and shoes put on the Cast
 * plate once). Not for a scene that brings its own clothes or is about the feet ("barefoot on
 * the sand", "heels in one hand") — those are dressed per still.
 */
export function dayStillWantsDressPlate(input: {
  /** The Cast plate to dress exists (a file or a URL). */
  castPlateAvailable: boolean;
  model: string | null | undefined;
  dayMood: string | null | undefined;
  intimateEnabled: boolean;
  plateSource?: 'keeper' | 'cast' | null;
  /** A clothing photo or ready packshot of the player's own. */
  customGarmentPicked: boolean;
  /** A kit the player picked (not one the Day picked for itself), or a locked kit. */
  kitPicked: boolean;
  /** The kit's packshot, when there is one to dress her from. */
  packshotUrl?: string | null;
  /** Normalised footwear ('' on auto). */
  pickedShoes: string;
  omitGarment: boolean;
  replaceOutfit: boolean;
  sceneHints?: string;
}): boolean {
  const shoesPicked = Boolean(input.pickedShoes) && !footwearIsBarefoot(input.pickedShoes);
  return (
    input.castPlateAvailable &&
    dayDressPlateApplies({
      model: input.model,
      dayMood: playedMood(input.dayMood, input.intimateEnabled),
      plateSource: input.plateSource,
      clothingPicked: input.customGarmentPicked || input.kitPicked,
      footwearPicked: shoesPicked,
      omitGarment: input.omitGarment,
      replaceOutfit: input.replaceOutfit,
    }) &&
    Boolean(input.customGarmentPicked || input.packshotUrl) &&
    !sceneDressesItself(input.dayMood, input.sceneHints) &&
    !(shoesPicked && beatOwnsFootwear(input.sceneHints))
  );
}

/**
 * How Image 1 is chosen:
 * - `nude` — a face crop (a distinct Cast face, or the auto crop); the garment is dropped.
 * - `face-break` — a face crop, so the plate's stance and underwear do not win: clothed heat
 *   poses that need the body unlocked, a seated Suggestive beat or an Everyday beat with a
 *   clothing-only garment over the undressed Cast plate (Rapid graph).
 * - `heat-full-plate` — the same stills on the Lightning identity engines, which keep the full
 *   plate as Image 1.
 * - `everyday-full-plate` — the other clothed stills on those engines.
 * - `plate` — the plate as it is.
 */
export type DayStillIdentityRoute =
  'nude' | 'face-break' | 'heat-full-plate' | 'everyday-full-plate' | 'plate';

export function dayStillIdentityRoute(input: {
  dayMood: string | null | undefined;
  model: string | null | undefined;
  sceneHints?: string;
  omitGarment: boolean;
  /** A Cast character is active (the nude face crop comes from it). */
  hasCharacter: boolean;
  /** There is a plate to start from at all. */
  hasIdentityPlate: boolean;
  /** Where that plate comes from; a Keep (or dressed) plate already wears the outfit. */
  identitySource?: 'keeper' | 'cast' | null;
  /** The still's garment is clothing only (a packshot), not a worn photo. */
  clothingOnlyGarment: boolean;
}): DayStillIdentityRoute {
  if (input.omitGarment && input.hasCharacter) {
    return 'nude';
  }
  if (!input.hasIdentityPlate) {
    return 'plate';
  }
  const mood = normalizeDayMood(input.dayMood);
  const lightning = isDayVacationLightningIdentityVlModel(input.model);
  const undressedPlateGarment =
    poseProfileForModel(input.model).rapidGraph &&
    input.identitySource !== 'keeper' &&
    input.clothingOnlyGarment;
  const suggestiveSeat =
    mood === 'suggestive' && undressedPlateGarment && daySuggestiveBeatIsSeated(input.sceneHints);
  const everydayGarment = mood === 'everyday' && undressedPlateGarment;
  const heatUnlock =
    (mood === 'vacation' || mood === 'suggestive') &&
    (dayClothedHeatPoseNeedsBodyUnlock(input.sceneHints, input.dayMood, {
      poseStickyModel: isQwenEdit2511PoseStickyModel(input.model),
    }) ||
      suggestiveSeat);
  if (heatUnlock || everydayGarment) {
    return lightning ? 'heat-full-plate' : 'face-break';
  }
  if (!isDayHeatMood(mood) && lightning) {
    return 'everyday-full-plate';
  }
  return 'plate';
}

/**
 * Where a dressed plate goes on this still: a still that starts from a face crop takes it as
 * the clothing image, one that starts from the full plate takes it as that plate. Null when
 * there is none or the still drops the garment.
 */
export function dayStillDressedPlateUse(input: {
  hasDressedPlate: boolean;
  omitGarment: boolean;
  faceOnlyIdentity: boolean;
}): 'plate' | 'clothing' | null {
  if (!input.hasDressedPlate || input.omitGarment) {
    return null;
  }
  return input.faceOnlyIdentity ? 'clothing' : 'plate';
}

/**
 * The clothing image this still carries, or null: none on a nude still, a replaced outfit or
 * when a partner's face takes the slot; on a face-break still only a clothing-only picture (a
 * worn photo would bring its own body and studio).
 */
export function dayStillClothingReinforce<
  T extends { imageUrl?: string; imageFilename?: string; source: 'custom' | 'packshot' },
>(input: {
  omitGarment: boolean;
  replaceOutfit: boolean;
  partnerFace: boolean;
  faceBreak: boolean;
  garment: T | null;
}): T | null {
  if (input.omitGarment || input.replaceOutfit || input.partnerFace) {
    return null;
  }
  if (input.faceBreak) {
    return isClothingOnlyDayGarment(input.garment) ? input.garment : null;
  }
  return input.garment;
}

/**
 * Whether the picked footwear goes on this still: clothed stills only, not Sport (the sport's
 * own shoes), not a beat about the feet, not a scene that dresses her itself (a swim still with
 * heels picked came out as loose feet and shoes in the foreground).
 */
export function dayStillFootwearApplies(input: {
  dayMood: string | null | undefined;
  intimateEnabled: boolean;
  sceneHints?: string;
}): boolean {
  return (
    !(isDayAdultMood(input.dayMood) && input.intimateEnabled) &&
    normalizeDayMood(input.dayMood) !== 'sport' &&
    !beatOwnsFootwear(input.sceneHints) &&
    !sceneDressesItself(input.dayMood, input.sceneHints)
  );
}
