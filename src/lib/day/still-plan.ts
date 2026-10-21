/**
 * Which picture goes where on a Day still — the decisions `queueSlot`
 * (useDayPlannerToolOrchestrationCore) makes between its uploads and renders, as pure functions.
 * The hook calls them, and so does day-finished-prompt-sweep.test.ts: the sweep used to carry
 * its own copy of each rule, which could drift from the hook without a test noticing.
 */
import { dayDressPlateApplies } from './dress-plate';
import { isDayAdultMood, isDayHeatMood, normalizeDayMood } from './planner';
import {
  isClothingOnlyDayGarment,
  isDayVacationLightningIdentityVlModel,
  isQwenEdit2511PoseStickyModel,
} from './plate';
import { dayClothedHeatPoseNeedsBodyUnlock, daySuggestiveBeatIsSeated } from './vacation';
import { beatOwnsFootwear, footwearIsBarefoot } from '../wardrobe/footwear';
import { PLAY_FACE_CROP_CANVAS } from '../plate/render-size';
import { poseModelFamily, poseProfileForModel } from '../pose/pose-model-profile';
import { beatLiesDown, vacationBeatDressesItself } from '../play/rapid-duo-recipe';
import { suggestiveBeatIsImpliedNudity } from '../wardrobe/clothed-coverage';

/** The mood a still plays as: an adult mood with Intimate off is Everyday. */
function playedMood(dayMood: string | null | undefined, intimateEnabled: boolean) {
  return isDayAdultMood(dayMood) && !intimateEnabled ? 'everyday' : dayMood;
}

/**
 * A scene that brings its own clothes (the pool's swimsuit, a robe) or none (Suggestive implied
 * nudity: a sheet, a towel, an arm across her chest). Live 2026-10-09: an implied Day started
 * from a kit's dressed plate put the kit's boots on her lying on the bed.
 */
function sceneDressesItself(dayMood: string | null | undefined, sceneHints: string | undefined) {
  const mood = normalizeDayMood(dayMood);
  return (
    (mood === 'vacation' && vacationBeatDressesItself(sceneHints)) ||
    (mood === 'suggestive' && suggestiveBeatIsImpliedNudity(sceneHints))
  );
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
      autoKit: !input.customGarmentPicked && !input.kitPicked && Boolean(input.packshotUrl),
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
  /** A dress-store plate is ready for this still (an Outfit Keep plate shows as `keeper`). */
  dressedPlate?: boolean;
}): DayStillIdentityRoute {
  if (input.omitGarment && input.hasCharacter) {
    return 'nude';
  }
  if (!input.hasIdentityPlate) {
    return 'plate';
  }
  // Qwen-Image 2.1 starts from the full plate: the face crop gave it a straight-on face to paste
  // onto every body (a back view with the face to the camera) and a catalogue-front pose. The
  // crop exists because the full plate froze Rapid / Edit 2511 standing — 2.1 does not freeze:
  // the user's own stills on the full plate, same graphs and seeds (2026-10-20), crouched,
  // stretched, held the book, walked (6/6), danced and knelt (4/4), with the face turned with the
  // body and the outfit from the clothing image.
  if (poseModelFamily(input.model) === 'qwen-image-2.1') {
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
  // Everyday on Edit 2511 with a dressed or Keep plate: as Image 1 the plate's studio-lit standing
  // figure was copied onto the place on upright beats — "pasted over the background" on
  // evening / late evening / night (2026-10-15). A face crop as Image 1 with the dressed plate as
  // the clothing image drew her into the scene's light; same seeds, the six beats that already
  // worked kept pose, outfit and shoes 6/6 and face match improved 0.34 → 0.23.
  if (
    mood === 'everyday' &&
    lightning &&
    (input.dressedPlate || input.identitySource === 'keeper')
  ) {
    return 'face-break';
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
 * Whether this still's scene brings its own clothes (a pool beat's swimsuit, a robe) or none.
 * The picked outfit's picture must not go with it.
 */
export function dayStillSceneDressesItself(input: {
  dayMood: string | null | undefined;
  intimateEnabled: boolean;
  sceneHints?: string;
}): boolean {
  return sceneDressesItself(playedMood(input.dayMood, input.intimateEnabled), input.sceneHints);
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
  /** The scene brings its own clothes (dayStillSceneDressesItself) and the outfit is not
   *  swimwear: the words say "a swimsuit" while the dress packshot rode Image 2, and 2/3 Vacation
   *  pool/paddleboard stills came out in the dress (night sweep, 2026-10-17). */
  sceneOwnsClothes?: boolean;
  /** The garment is the dressed (or Outfit Keep) plate in the clothing slot — she is meant to
   *  wear exactly what it shows, so a face-break still takes it although she is in it. */
  dressedPlateClothing?: boolean;
}): T | null {
  if (input.omitGarment || input.replaceOutfit || input.partnerFace || input.sceneOwnsClothes) {
    return null;
  }
  if (input.faceBreak) {
    return input.dressedPlateClothing || isClothingOnlyDayGarment(input.garment)
      ? input.garment
      : null;
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

/** Pose layouts that have her lying down. */
const LYING_LAYOUTS: ReadonlySet<string> = new Set([
  'lie',
  'lie_side',
  'lie_front',
  'lounge_elbows',
  'prone',
]);

/**
 * Whether this still has her lying down: the drawn layout says so, or — on a one-person still —
 * the beat does (on a pair, "he lies propped on an elbow" is about him).
 */
export function dayStillLiesDown(input: {
  beat: string | null | undefined;
  layout?: string | null;
  /** People on the still (default one). */
  figures?: number;
}): boolean {
  return (
    LYING_LAYOUTS.has(input.layout?.trim() ?? '') ||
    ((input.figures ?? 1) < 2 && beatLiesDown(input.beat))
  );
}

/** A finished Day prompt names her clothes on a line of its own. */
export const DAY_OUTFIT_LINE_RE = /^OUTFIT \(mandatory\):/m;

/** Landscape canvas for a lying solo still on a face crop (pose-model-profile: wideLyingSolo). */
export const DAY_LYING_WIDE_CANVAS = {
  width: PLAY_FACE_CROP_CANVAS.height,
  height: PLAY_FACE_CROP_CANVAS.width,
} as const;

/**
 * The canvas for a Day still whose Image 1 is a face crop: the portrait face-crop canvas, or
 * landscape for one person lying down on an engine that wants it — only when the prompt names
 * her outfit (wide without that line drew her nude).
 */
export function dayStillFaceCropCanvas(input: {
  model: string | null | undefined;
  /** One person on the still. */
  solo: boolean;
  lying: boolean;
  /** The still's prompt has an OUTFIT (mandatory) line. */
  outfitLine: boolean;
}): { width: number; height: number } {
  return poseProfileForModel(input.model).wideLyingSolo &&
    input.solo &&
    input.lying &&
    input.outfitLine
    ? { ...DAY_LYING_WIDE_CANVAS }
    : { ...PLAY_FACE_CROP_CANVAS };
}
