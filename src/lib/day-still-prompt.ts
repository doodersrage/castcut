/**
 * The text of a Day still's prompt, assembled from decisions that are already made — which image
 * is which, who is in the still, what she wears, which pose was drawn.
 *
 * This used to live inside the Day queue hook, between uploads, where nothing could test it: a
 * one-person still that described two people, a pose map called "Image 3" on a two-image still
 * and solo wording on a two-person still were all found by rendering. Here the same code runs
 * in the hook and in the sweep that walks every planner beat on every engine
 * (day-prompt-sweep.test.ts), so a contradiction in the finished prompt fails a test.
 */

import { dayClothedLeadLines } from '@/lib/day-clothed-lead';
import {
  inDayPromptVoice,
  masculineClothes,
  restoreText,
  swapDayPromptGender,
} from '@/lib/day-lead-gender';
import {
  dayPartnerBriefLine,
  dayPartnerRecipeLine,
  scrubDayPartnerOutfitImageClaims,
  type DayPartner,
  type DayPartnerNoun,
} from '@/lib/day-partner';
import { sameSexPartnerBeat } from '@/lib/day-lead-gender';
import {
  buildDaySlotPrompt,
  dayBeatIsTyped,
  dayBeatOmitsGarmentPackshot,
  dayMoodReplacesKeepOutfit,
  isDayAdultMood,
  normalizeDayIntimateMix,
  normalizeDayMood,
  renumberDayPoseGuideAsImage2,
  type DaySlot,
} from '@/lib/day-planner';
import {
  resolveDayGarmentReinforce,
  resolveDayQueueIdentityPlate,
  type DayPlate,
} from '@/lib/day-plate';
import { dayStillLiesDown } from '@/lib/day-still-plan';
import { withDayWeather } from '@/lib/day-weather';
import type { PoseLeadPosition } from '@/lib/pose-guide-openpose';
import type { PoseGuideStylePreference } from '@/lib/pose-guide-prompt';
import { footwearIsBarefoot, withFootwearLine } from '@/lib/footwear';
import { reinforceIntimateStillPrompt } from '@/lib/intimate-prompt-clarify';
import { KLEIN_FACE_REFERENCE_LINE } from '@/lib/klein-face-reference';
import { poseLayoutCueLine, poseLookLine, withRecipePoseCue } from '@/lib/pose-coaching';
import { POSE_MISMATCH_NUDGE } from '@/lib/pose-score';
import { RAPID_DUO_RECIPE_MARK, isRapidDuoRecipePrompt } from '@/lib/rapid-duo-recipe-mark';
import { applyAdultAgeSafeguards, type AgePerson } from '@/lib/adult-age-safeguard';
import { dayMoodNeedsAdultSafeguards } from '@/lib/adult-appearance-gate';

export type DayStillPromptFacts = {
  /** The slot's brief or recipe (buildDaySlotPrompt). */
  slotPrompt: string;
  beat?: string | null;
  /** The beat is the player's own words (dayBeatIsTyped). */
  beatTyped?: boolean;
  setting?: string | null;
  dayMood: string | null | undefined;
  /** An adult mood with Intimate on. */
  adult: boolean;
  leadNoun: DayPartnerNoun;
  /** The lead's own description — put back unswapped for a man lead. */
  leadDescriptor?: string;
  /** The second person on this still (a Cast partner or an invented one), if any. */
  partner: DayPartner | null;
  partnerOutfit: string | null;
  /** The lead's outfit in words, for the opening lines of a clothed brief. */
  leadOutfit: string | null;
  /** The clothing image is the dressed plate (a picture of her, dressed) — not a packshot. */
  dressedPlateIsClothingImage: boolean;
  /** Shoes picked in the Footwear picker ('' = none), before per-still rules. */
  pickedShoes: string;
  /** Shoes this still orders ('' when the beat or mood rules them out). */
  footwear: string;
  footwearImage: 'combined' | null;
  /** The pose guide that was drawn, if any. */
  pose: { layout: string | null; poseKey?: string | null; figures: number } | null;
  /** Layouts whose pose is always spelled out in words (play metrics). */
  cueLayouts: ReadonlySet<string>;
  poseLook?: Parameters<typeof poseLookLine>[0];
  /** The Klein face reference rides along as the last image. */
  kleinFace: boolean;
  /** The quality gate's fix for a reroll, once. */
  qualityNudge?: string;
};

export type AssembledDayStillPrompt = {
  prompt: string;
  /** The drawn pose was spelled out as a cue line (recorded on the pose expectation). */
  cued: boolean;
  /** A man lead: the finished text is swapped (finishDayStillPrompt). */
  swapLead: boolean;
  /** A compact recipe — it skips the lint round-trip. */
  recipe: boolean;
};

/** Brief / recipe + opening lines, footwear, partner, pose cue, look, fixes. */
export function assembleDayStillPrompt(facts: DayStillPromptFacts): AssembledDayStillPrompt {
  const scrubbed = facts.partner
    ? scrubDayPartnerOutfitImageClaims(facts.slotPrompt)
    : facts.slotPrompt;
  // The clothing image is the dressed plate: a picture of her, dressed — not a packshot.
  // Every way the prompts name that image is reworded (the solo recipes' sentence, the
  // couple recipe's clause, the long brief's "clothing-only packshot").
  const dressedWorn =
    Boolean(facts.pickedShoes) && !footwearIsBarefoot(facts.pickedShoes)
      ? 'the outfit and the shoes'
      : 'the outfit';
  // Not "standing" on a lying still: the plate's stance pulled lying beats upright.
  const dressedStance = dayStillLiesDown({
    beat: facts.beat,
    layout: facts.pose?.layout,
    figures: facts.pose?.figures || (facts.partner ? 2 : 1),
  })
    ? 'dressed'
    : 'dressed, standing';
  const basePrompt = facts.dressedPlateIsClothingImage
    ? scrubbed
        .replace(
          /\bthe outfit from the second image\b/gi,
          `${dressedWorn} shown in the second image (the same person, ${dressedStance})`
        )
        .replace(
          /\bImage 2 is (?:a|the) clothing-only packshot\b/gi,
          'Image 2 is a picture of her already dressed'
        )
    : scrubbed;
  const recipe = isRapidDuoRecipePrompt(basePrompt);
  const figures = facts.pose?.figures ?? 0;
  const drawnLayout = facts.pose?.layout ?? null;
  const qualityNudge = facts.qualityNudge?.trim();
  // A one-person recipe always carries the cue, inside the recipe (withRecipePoseCue).
  const recipeCue = recipe && figures === 1;
  // Spell the drawn pose out in words after a pose miss, and always for layouts Edit has a poor
  // record with (step one before the guide falls back to a plainer pose).
  const cueLine =
    !recipeCue &&
    drawnLayout &&
    (facts.cueLayouts.has(drawnLayout) || Boolean(qualityNudge?.includes(POSE_MISMATCH_NUDGE)))
      ? poseLayoutCueLine(drawnLayout, facts.pose?.figures)
      : '';
  const lookLine = poseLookLine(facts.poseLook, figures || 1);
  // A man lead: Day's text is written for a woman — swap it (not the adult duo recipe, which is
  // built for him already; not adult duo briefs, which would swap the roles).
  const leadHeadcount = figures || 1;
  const swapLead =
    facts.leadNoun === 'man' &&
    !basePrompt.includes(RAPID_DUO_RECIPE_MARK) &&
    // The couple recipes (Suggestive, and the everyday one Day uses for a pair) are written for
    // the pair already (see their `lead`); swapped again, "A man and his friend" came out as
    // "A woman and her friend" with a man lead (live, two men on Day).
    !/ together, both fully clothed, (?:affectionate|both fully in frame)\./.test(basePrompt) &&
    !(facts.adult && leadHeadcount >= 2);
  // The whole finished prompt is swapped later; the partner line names the partner's own gender,
  // so it goes in pre-swapped (the swap turns it back).
  const forLead = (text: string) => (swapLead && text ? swapDayPromptGender(text) : text);
  // Clothed stills: Rapid follows the opening lines, and the brief's opening only names her —
  // duo beats lost the partner (4/10) and outdoor beats went barefoot. Live A/B (2026-09-30,
  // same seeds): a TWO PEOPLE opening line kept the partner 10/10; a footwear line put shoes on
  // 4/4 outdoors.
  const clothedLeadLines = recipe
    ? []
    : dayClothedLeadLines({
        beat: facts.beatTyped ? inDayPromptVoice(facts.beat, facts.leadNoun) : facts.beat,
        setting: facts.setting ?? undefined,
        headcount: leadHeadcount,
        dayMood: facts.dayMood,
        adult: facts.adult,
        companionLook: facts.partner?.descriptor,
        leadOutfit: facts.leadOutfit,
        partnerOutfit: facts.partnerOutfit,
      });
  const prompt = [
    // The picked footwear replaces the automatic "shoes that suit the outfit" line.
    ...clothedLeadLines.filter(
      line => !(facts.footwear && /^She wears shoes that suit/.test(line))
    ),
    withFootwearLine(
      recipeCue ? withRecipePoseCue(basePrompt, drawnLayout, facts.pose?.poseKey) : basePrompt,
      facts.footwear,
      // Written for a woman and swapped later — except where the prompt is already the man's
      // (the couple recipes), which keep it as written.
      facts.leadNoun === 'man' && !swapLead ? 'he' : 'she',
      facts.footwearImage,
      // Whose shoes these are, whenever the still has a partner — the pose count alone missed a
      // duo whose guide was planned with one figure (partner in the lead's sneakers, live).
      figures >= 2 || Boolean(facts.partner)
    ),
    // The duo recipes name the partner's image themselves; the long brief (and a recipe that has
    // no partner wording, e.g. Klein spoon) gets one line.
    !facts.partner
      ? ''
      : !recipe
        ? forLead(dayPartnerBriefLine(facts.partner))
        : /face from the second image|own face\./.test(basePrompt)
          ? ''
          : forLead(dayPartnerRecipeLine(facts.partner, 'second', undefined, facts.leadNoun)),
    cueLine,
    lookLine,
    facts.kleinFace ? KLEIN_FACE_REFERENCE_LINE : '',
    qualityNudge ? `QUALITY FIX: ${qualityNudge}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { prompt, cued: Boolean(cueLine), swapLead, recipe: isRapidDuoRecipePrompt(prompt) };
}

/** Who is on a Day still, for the age sentence (adult-age-safeguard.ts). */
export type DayStillAgeFacts = {
  /** The mood the still plays as (dayPlayedMood): Suggestive, Intimate and Raunchy get it. */
  playedMood: string | null | undefined;
  lead: AgePerson;
  /** The second person (a Cast partner, an invented one, or a companion), if any. */
  partner?: AgePerson | null;
  /** People the still shows (the pose map's figures, else 1 / 2 with a partner). */
  people: number;
  /** The stronger wording — the one requeue after the adult-appearance gate withheld a take. */
  strong?: boolean;
};

/** The people on a Day still as the age sentence names them. */
export function dayStillAgeFacts(input: {
  playedMood: string | null | undefined;
  leadNoun: DayPartnerNoun;
  lead?: { ageBand?: AgePerson['ageBand']; descriptor?: string | null } | null;
  partner?: DayPartner | null;
  figures?: number | null;
  strong?: boolean;
}): DayStillAgeFacts {
  const people = input.figures || (input.partner ? 2 : 1);
  return {
    playedMood: input.playedMood,
    lead: {
      noun: input.leadNoun,
      ageBand: input.lead?.ageBand ?? null,
      descriptor: input.lead?.descriptor ?? null,
    },
    partner:
      people >= 2
        ? {
            noun: input.partner?.noun ?? (input.leadNoun === 'man' ? 'woman' : 'man'),
            ageBand: input.partner?.ageBand ?? null,
            descriptor: input.partner?.descriptor ?? null,
          }
        : null,
    people,
    ...(input.strong ? { strong: true } : {}),
  };
}

/**
 * The last steps on the drafted text (after the optional lint round-trip): adult reinforcement,
 * the man-lead swap, and on Suggestive / Intimate / Raunchy stills the adult safeguards — youth
 * words out and the age sentence in (after the pose sentence on a recipe).
 */
export function finishDayStillPrompt(
  drafted: string,
  input: {
    /** The mood the still plays as (an adult mood with Intimate off plays as Everyday). */
    adultMood: boolean;
    adult: boolean;
    swapLead: boolean;
    leadDescriptor?: string;
    /** The partner's own description (a Cast partner) — already right, never swapped. */
    partnerDescriptor?: string;
    /** Who is on the still, for the age sentence (dayStillAgeFacts). */
    ages?: DayStillAgeFacts;
  }
): string {
  const swapped = finishDayStillWording(drafted, input);
  const ages = input.ages;
  if (!ages || !dayMoodNeedsAdultSafeguards(ages.playedMood)) return swapped;
  return applyAdultAgeSafeguards(swapped, {
    lead: ages.lead,
    partner: ages.partner,
    people: ages.people,
    strong: ages.strong,
  });
}

function finishDayStillWording(
  drafted: string,
  input: Parameters<typeof finishDayStillPrompt>[1]
): string {
  // Adult moods only — reinforceIntimateStillPrompt false-positives on Suggestive / Vacation
  // ("hands on" zipper, "sex contact" bans) and injects nude/duo locks that fight CLOTHING LOCK
  // → bikini/beach drift.
  const reinforced = input.adultMood ? reinforceIntimateStillPrompt(drafted) : drafted;
  if (!input.swapLead) return reinforced;
  // The lead's and the partner's own descriptions already read right — set them aside while
  // the rest is reworded for a man lead. Swapped too, a man partner was written as "a White
  // woman … with a ginger beard" (live, two men on Day).
  const kept = [input.partnerDescriptor, input.leadDescriptor]
    .map(text => text?.trim() ?? '')
    .filter(text => text.length > 0);
  let held = reinforced;
  kept.forEach((text, index) => {
    held = held.split(text).join(`\u0000${index}\u0000`);
  });
  let swapped = masculineClothes(swapDayPromptGender(held, { solo: input.adult }));
  kept.forEach((text, index) => {
    swapped = swapped.split(`\u0000${index}\u0000`).join(text);
  });
  // A description quoted in another form (the lead's inside a sentence) is still put back.
  return restoreText(swapped, (input.leadDescriptor ?? '').trim());
}

/**
 * The prompt as queued: with no image in the second slot the queue compacts the pose guide into
 * it, and the text must say so. `attached` lists what rides along after Image 1.
 */
export function queuedDayStillPrompt(
  finished: string,
  attached: { second: boolean; third: boolean }
): { prompt: string; guideIsImage2: boolean; imageCount: number } {
  const guideIsImage2 = attached.third && !attached.second;
  // The long brief's stock line names both extra images whatever is attached.
  const named = attached.third
    ? finished
    : finished.replace(
        /\bNever leave Image 2 or Image 3 white as the scene background\b/g,
        attached.second
          ? 'Never leave Image 2 white as the scene background'
          : 'Never leave the scene background white'
      );
  return {
    prompt: guideIsImage2 ? renumberDayPoseGuideAsImage2(named) : named,
    guideIsImage2,
    imageCount: 1 + Number(attached.second) + Number(attached.third),
  };
}

export type DayStillSlotOptions = {
  poseGuide?: boolean;
  poseGuideStyle?: PoseGuideStylePreference;
  poseLeadPosition?: PoseLeadPosition | null;
  poseCamera?: 'overhead' | 'side' | 'low' | null;
  faceOnlyIdentity?: boolean;
  forceGarmentReinforce?: boolean;
  /**
   * Whether a clothing image rides along on this still, when the queue already knows. False
   * wins: a face-break still drops a clothing photo that is not a clothing-only packshot, and
   * the recipe kept saying "the outfit from the second image" — which was then the pose map
   * (finished-prompt sweep, 3,384 combinations).
   */
  clothingImageAttached?: boolean;
  /** Cast partner whose face is attached as Image 2 on this still (garment goes to text). */
  partner?: DayPartner | null;
  /** This still starts from a dressed plate: Image 1 wears the outfit, no clothing image. */
  dressPlate?: DayPlate | null;
  /** The clothing image is the dressed plate (Rapid / Qwen-Image 2.1 with a face-crop Image 1). */
  clothingIsDressedPlate?: boolean;
};

/** What the Day tool knows when it writes a slot's brief or recipe. */
export type DayStillSlotState = {
  /** The Day plate as shown (Cast look plate or an Outfit Keep). */
  plate: DayPlate | null | undefined;
  /** The plate the queue would send as Image 1 by default. */
  queuePlate: DayPlate | null | undefined;
  character: Parameters<typeof resolveDayQueueIdentityPlate>[0]['character'];
  hasPlate: boolean;
  leadNoun: DayPartnerNoun;
  /** The slot's kit packshot, when it has one. */
  packshotUrl?: string | null;
  /** The slot's kit, as the prompt names it. */
  wardrobeLabel?: string;
  customGarmentUrl?: string;
  customGarmentFilename?: string;
  customGarmentDescription?: string;
  /** The picked mood; an adult mood with Intimate off plays as Everyday. */
  dayMood: string | null | undefined;
  intimateEnabled: boolean;
  intimateMix?: string | null;
  allowCompanions: boolean;
  dayWeather?: Parameters<typeof withDayWeather>[1];
  lockedLocation?: string;
  notes?: string;
  model: string;
  realismMode?: Parameters<typeof buildDaySlotPrompt>[0]['realismMode'];
  /** The engine's pose-guide style when the still did not draw one. */
  defaultPoseGuideStyle: PoseGuideStylePreference;
};

/** The mood a still plays as. */
export function dayPlayedMood(dayMood: string | null | undefined, intimateEnabled: boolean) {
  return normalizeDayMood(isDayAdultMood(dayMood) && !intimateEnabled ? 'everyday' : dayMood);
}

/**
 * A slot's brief or recipe for one still: what `buildDaySlotPrompt` needs, decided from the Day
 * state and what the queue has attached. The Day hook and the finished-prompt sweep both call
 * this, so a rule changed here is the rule that is tested.
 */
export { dayBeatIsTyped } from '@/lib/day-planner';

export function buildDaySlotPromptForStill(
  slot: DaySlot,
  state: DayStillSlotState,
  options?: DayStillSlotOptions
): string {
  // A beat or Setting the player typed for a man lead, in the voice the prompt is built in.
  // Only the player's own words: Day's beats for a man lead are stored already reworded.
  if (state.leadNoun === 'man') {
    if (dayBeatIsTyped(slot)) {
      slot = { ...slot, sceneHints: inDayPromptVoice(slot.sceneHints, state.leadNoun) };
    }
    state = { ...state, notes: inDayPromptVoice(state.notes, state.leadNoun) };
  }
  const garmentReinforce = Boolean(
    !options?.dressPlate &&
    options?.clothingImageAttached !== false &&
    !(options?.partner && !options.partner.invented) &&
    (options?.forceGarmentReinforce ||
      resolveDayGarmentReinforce({
        plateSource: state.plate?.source,
        packshotUrl: state.packshotUrl ?? undefined,
        customGarmentUrl: state.customGarmentUrl,
        customGarmentFilename: state.customGarmentFilename,
      }))
  );
  const dayMood = dayPlayedMood(state.dayMood, state.intimateEnabled);
  const omitGarment = dayBeatOmitsGarmentPackshot({
    blurb: slot.sceneHints,
    prompt: [slot.location, slot.sceneHints].filter(Boolean).join(' · '),
    dayMood,
    intimateMix: normalizeDayIntimateMix(state.intimateMix),
  });
  const replaceKeepOutfit = dayMoodReplacesKeepOutfit(dayMood);
  const preferCastPlate = replaceKeepOutfit || omitGarment;
  const identityPlate = preferCastPlate
    ? resolveDayQueueIdentityPlate({
        character: state.character,
        displayPlate: state.plate,
        preferCastPlate: true,
        preferFaceOnlyPlate: omitGarment,
      })
    : (options?.dressPlate ?? state.queuePlate);
  const poseGuide = options?.poseGuide !== false && Boolean(state.hasPlate);
  // A same-sex partner: beats are written for a woman with a man ("her arms around his neck") —
  // name the partner instead. For a man lead the whole prompt is swapped later, so "her
  // girlfriend" comes out as "his boyfriend".
  const sameSexPartner =
    options?.partner &&
    options.partner.noun !== 'person' &&
    options.partner.noun === state.leadNoun;
  const beatSlot =
    sameSexPartner && slot.sceneHints
      ? { ...slot, sceneHints: sameSexPartnerBeat(slot.sceneHints) }
      : slot;
  return buildDaySlotPrompt({
    // Weather / season rides on the Setting (SCENE lead, SETTING line, recipe room).
    slot: state.dayWeather
      ? { ...beatSlot, location: withDayWeather(beatSlot.location, state.dayWeather) }
      : beatSlot,
    wardrobeLabel: state.wardrobeLabel,
    characterName: state.character?.name,
    characterDescriptor: state.character?.descriptor || state.character?.hints,
    lockedLocation: state.lockedLocation,
    notes: state.notes,
    hasPlate: state.hasPlate,
    plateSource: identityPlate?.source,
    plateIsolated: identityPlate?.isolated === true,
    garmentReinforce: garmentReinforce && !omitGarment && !replaceKeepOutfit,
    garmentDescription: state.customGarmentDescription,
    poseGuide,
    poseGuideStyle: options?.poseGuideStyle ?? state.defaultPoseGuideStyle,
    poseLeadPosition: options?.poseLeadPosition ?? null,
    poseCamera: options?.poseCamera ?? null,
    model: state.model,
    realismMode: state.realismMode,
    allowCompanions: state.allowCompanions,
    dayMood,
    intimateMix: normalizeDayIntimateMix(state.intimateMix),
    omitGarment,
    faceOnlyIdentity: options?.faceOnlyIdentity === true,
    replaceKeepOutfit,
    partner: options?.partner ?? null,
    leadNoun: state.leadNoun,
    outfitIsDressedPlate:
      Boolean(options?.dressPlate) ||
      (garmentReinforce && options?.clothingIsDressedPlate === true),
  });
}
