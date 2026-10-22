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

import { withCastPlace } from '../cast/places';
import { castRelationSentence } from '../cast/relationships';
import { withEatingUtensil } from '../wardrobe/eating-utensil';
import { dayClothedLeadLines } from '@/lib/day/clothed-lead';
import {
  inDayPromptVoice,
  masculineClothes,
  restoreText,
  swapDayPromptGender,
} from '@/lib/day/lead-gender';
import {
  dayPartnerBriefLine,
  dayPartnerRecipeLine,
  scrubDayPartnerOutfitImageClaims,
  type DayPartner,
  type DayPartnerNoun,
} from '@/lib/day/partner';
import { sameSexPartnerBeat } from '@/lib/day/lead-gender';
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
} from '@/lib/day/planner';
import {
  resolveDayGarmentReinforce,
  resolveDayQueueIdentityPlate,
  type DayPlate,
} from '@/lib/day/plate';
import { dayStillLiesDown } from '@/lib/day/still-plan';
import { resolveRoleplaySetting } from '@/lib/story/roleplay';
import { beatFitsSetting, fitBeatToSetting, withSceneGround } from '@/lib/scene/surface';
import { withDayWeather } from '@/lib/day/weather';
import type { PoseLeadPosition } from '@/lib/pose/guide-openpose';
import {
  cameraChoiceLine,
  withoutConflictingFraming,
  type PoseCameraChoice,
} from '@/lib/pose/camera-shot';
import type { PoseGuideStylePreference } from '@/lib/pose/guide-prompt';
import { dayAutoFootwear, footwearIsBarefoot, withFootwearLine } from '@/lib/wardrobe/footwear';
import { reinforceIntimateStillPrompt } from '@/lib/adult/intimate-prompt-clarify';
import { KLEIN_FACE_REFERENCE_LINE } from '@/lib/engine/klein-face-reference';
import {
  ALWAYS_CUED_DUO_LAYOUTS,
  dayDuoPoseWords,
  poseLayoutCue,
  poseLayoutCueLine,
  poseLookLine,
  withDuoRecipePoseSentence,
  withRecipePoseCue,
  withSportActionPoseCue,
  type DuoPoseNames,
  sportPoseFirstLine,
} from '@/lib/pose/coaching';
import { customPoseFirstLine, withCustomPoseSentence } from '@/lib/pose/describe';
import { POSE_MISMATCH_NUDGE } from '@/lib/pose/score';
import { RAPID_DUO_RECIPE_MARK, isRapidDuoRecipePrompt } from '@/lib/prompt/recipe-mark';
import { adultBodyPhrase } from '@/lib/character/appearance';
import { applyAdultAgeSafeguards, type AgePerson } from '@/lib/adult/adult-age-safeguard';
import { dayMoodNeedsAdultSafeguards } from '@/lib/adult/adult-appearance-gate';
import {
  dayMoodMustStayClothed,
  softenBareSkinWords,
  withStrongCoverageLine,
} from '@/lib/wardrobe/clothed-coverage';

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
  footwearImage: 'combined' | 'worn' | null;
  /** The pose guide that was drawn, if any. */
  pose: { layout: string | null; poseKey?: string | null; figures: number } | null;
  /**
   * Lead with the stance in words ("POSE FIRST: …") — clothed one-person stills on Edit 2511
   * with a pose map. Same seeds (2026-10-15): Everyday 3/8 better, Vacation 1/8, Suggestive 3/7,
   * Sport 2/8, none worse — the rest already followed their maps.
   */
  poseFirst?: boolean;
  /**
   * With `poseFirst`, on Qwen-Image 2.1: the line from the recipe's own stance and Moment,
   * without naming a map. 2.1 drops the planner's own maps (painted as limbs); a custom pose's map
   * is attached and named by the recipe, as on every engine (qwen-image-21-renderer:
   * isPlayerPoseGuide).
   */
  poseFirstWithoutMap?: boolean;
  /**
   * The plain posture the player picked in the slot's pose picker (`sit`, `kneel`, `walk` …; a
   * body pose, not a layout). Said in words when the engine drops the planner's map
   * (`poseFirstWithoutMap`): there the map was the only place the pick lived.
   */
  pickedPosture?: string | null;
  /**
   * A custom pose (joint editor, a photo, My poses, a pose pack) in words — `describePhotoPose`.
   * Sent as the recipe's Pose: sentence, or the brief's first line.
   */
  customPose?: string | null;
  /** Layouts whose pose is always spelled out in words (play metrics). */
  cueLayouts: ReadonlySet<string>;
  poseLook?: Parameters<typeof poseLookLine>[0];
  /** The Klein face reference rides along as the last image. */
  kleinFace: boolean;
  /** The quality gate's fix for a reroll, once. */
  qualityNudge?: string;
  /** A camera angle for this slot (dayStillCamera) — Day's stills were all eye level. */
  camera?: DayStillCamera | null;
  /**
   * The camera the player picked (dayStillPickedCamera: a custom 3D pose's own camera, else the
   * slot's Camera row). Its line replaces the one Day would pick (`camera`, the brief's own
   * "camera: …" framing) and the framing words that would fight it.
   */
  pickedCamera?: PoseCameraChoice | null;
  /**
   * The engine wants the layout's cue after the sport ACTION sentence (pose-model-profile:
   * sportActionCue) — the long sport brief has none of its own.
   */
  /** Her marks that show in this still (cast-marks.ts castMarksLine), or ''. */
  leadMarks?: string;
  /** Her phone / dog / car when the beat mentions it (cast-props.ts castPropsLine), or ''. */
  leadProps?: string;
  sportActionCue?: boolean;
};

export type DayStillCamera = 'low' | 'high' | 'wide';

const DAY_STILL_CAMERA_LINES: Record<DayStillCamera, string> = {
  wide: 'Camera: a wide shot from a few metres away — her whole body small in the frame, with much more of the place around her.',
  low: 'Camera: a low angle from about knee height, looking slightly up at her — her whole body in frame.',
  high: 'Camera: a slightly high angle from above eye level, looking down at her — her whole body in frame.',
};

/**
 * The picked camera line in a Day prompt: after the recipe's "Day photo: …." sentence (where
 * Day's own camera line goes), else in place of the brief's "camera: …" framing (what follows
 * its first " — " or ";" stays: the mood's locks), else first. Framing words elsewhere that
 * would fight a closer shot come out (camera-shot.ts withoutConflictingFraming).
 */
export function withPickedCameraLine(
  prompt: string,
  choice: PoseCameraChoice | null | undefined,
  who: 'her' | 'him' | 'them' = 'her'
): string {
  const line = cameraChoiceLine(choice, { who });
  if (!line) return prompt;
  let out: string;
  if (/Day photo: [^\n]*?\./.test(prompt)) {
    out = prompt.replace(/(Day photo: [^\n]*?\.)/, `$1 ${line}`);
  } else if (/^camera: [^\n]*$/m.test(prompt)) {
    out = prompt.replace(/^camera: ([^\n]*)$/m, (_match, rest: string) => {
      const cut = rest.search(/ — |; /);
      return cut >= 0 ? `${line.replace(/\.$/, '')}${rest.slice(cut)}` : line;
    });
  } else {
    out = `${line}\n${prompt}`;
  }
  return withoutConflictingFraming(out, choice);
}

const DAY_SLOT_ORDER = [
  'morning',
  'morning-2',
  'afternoon',
  'afternoon-2',
  'evening',
  'evening-2',
  'night',
  'night-2',
];
const CAMERA_CYCLE: Array<DayStillCamera | null> = [null, 'low', 'high', 'wide'];

/**
 * A camera for a clothed one-person Day still on Edit 2511, by slot, so a Day is not every shot
 * at eye level (a re-take keeps its slot's camera). Edit 2511 followed all three (wide, low,
 * high) on four Everyday stills with the pose, outfit and shoes kept, whole body in frame for
 * the pose and shoe checks (2026-10-08). Duos, Sport, the adult moods and other engines: none.
 */
export function dayStillCamera(input: {
  slotId: string | null | undefined;
  model: string | null | undefined;
  dayMood: string | null | undefined;
  adult: boolean;
  people: number;
}): DayStillCamera | null {
  if (input.adult || input.people !== 1) return null;
  // Edit 2511, and Qwen-Image 2.1 (Turbo, 24 Everyday stills: wider and three-quarter framing
  // instead of every still front-on at eye level, likeness unchanged — 2026-10-17).
  if (
    !/qwen-image-edit-2511|qwen_image_edit_2511/i.test(input.model ?? '') &&
    !/^qwen-image-2\.1/i.test(input.model ?? '')
  )
    return null;
  if ((input.dayMood ?? '').toLowerCase() === 'sport') return null;
  const index = DAY_SLOT_ORDER.indexOf((input.slotId ?? '').trim());
  if (index < 0) return null;
  return CAMERA_CYCLE[index % CAMERA_CYCLE.length] ?? null;
}

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
/**
 * "POSE FIRST: she walks mid-step, one foot ahead of the other, exactly as the pose map in
 * Image 3 shows." — from a one-person recipe's own stance sentence ("She walks …"), else its
 * "Pose:" sentence, else its "Moment:". '' when the recipe has no pose map.
 */
export function dayPoseFirstLine(
  prompt: string,
  options: {
    /**
     * One person on Qwen-Image 2.1, which drops the planner's own map: the same line without
     * "exactly as the pose map shows" — the words carry the pose.
     */
    withoutMap?: boolean;
  } = {}
): string {
  const duo = /Match their two bodies to the (second|third|fourth) image \(pose map\)/.exec(
    prompt
  )?.[1];
  const map =
    duo ?? /Match her body to the (second|third|fourth) image \(pose map\)/.exec(prompt)?.[1];
  if (!map && !options.withoutMap) return '';
  // Without a map the line never names one: Qwen-Image 2.1's converter drops every line that
  // points at the (removed) map, and a "POSE FIRST … pose map" line went with it.
  const image =
    map && !options.withoutMap
      ? { second: 2, third: 3, fourth: 4 }[map as 'second' | 'third' | 'fourth']
      : 0;
  // Without a map, a couple recipe is known by its opening ("A woman and a man together").
  const twoPeople =
    Boolean(duo) ||
    (options.withoutMap === true && /\bDay photo: [^.\n]*\btogether\b/i.test(prompt));
  if (twoPeople) {
    // Two people: the recipe's own Pose: sentence (body-by-body placement), else the Moment.
    // Same seeds, 12 clothed duo beats on Edit 2511 (2026-10-15): 5 clearer (sharing a drink /
    // dessert leaning in, head on a shoulder seated, earbuds, selfie arm), 0 worse.
    const pose = /\bPose: ([^.\n]+)\./.exec(prompt)?.[1]?.trim();
    const moment = /\bMoment: ([^.\n]+)\./.exec(prompt)?.[1]?.trim();
    // A layout cue may open with "the two people …" itself — say it once.
    const words = (pose || moment)?.replace(/^the two people\s+/i, '');
    if (!words) return '';
    return image
      ? `POSE FIRST: the two people — ${words}, exactly as the pose map in Image ${image} shows.`
      : `POSE FIRST: the two people — ${words}.`;
  }
  const body = /Day photo:([^\n]*)/.exec(prompt)?.[1] ?? prompt;
  const sentences = body
    .split(/(?<=\.)\s+/)
    .map(sentence => sentence.trim().replace(/\.$/, ''))
    .filter(Boolean);
  const stance = sentences.find(sentence => /^She (?!wears\b)[a-z]/.test(sentence));
  const pose = sentences.find(sentence => sentence.startsWith('Pose: '))?.slice(6);
  const moment = sentences.find(sentence => sentence.startsWith('Moment: '))?.slice(8);
  const lead = stance ? `she${stance.slice(3)}` : pose ? pose : '';
  // The stance alone ("she crouches low, knees bent deep") left the beat's action and prop to the
  // Moment far down, and Edit 2511 drew the posture with empty hands: no dog, crate, bike, bag or
  // lace. With the Moment in the first line: 18/20 vs 5/20 on ten such beats, two seeds each, the
  // six beats it already drew unchanged (live 2026-10-17).
  const words = lead
    ? moment && !lead.toLowerCase().includes(moment.toLowerCase())
      ? `${lead} — ${moment}`
      : lead
    : moment
      ? // A moment that opens with its own verb ("stands tall…", "reads a book…") is said as
        // "she stands…", not "she is stands…" (pose packs' beats do).
        /^[a-z]+s\b/i.test(moment) && !/^(?:his|this|its|plus|as)\b/i.test(moment)
        ? `she ${moment}`
        : `she is ${moment}`
      : '';
  if (!words) return '';
  return image
    ? `POSE FIRST: ${words}, exactly as the pose map in Image ${image} shows.`
    : `POSE FIRST: ${words}.`;
}

/** The image a recipe names as its pose map ("Match her body to the third image (pose map)"). */
function recipePoseMapImage(prompt: string): number | null {
  const word =
    /Match (?:her body|their two bodies) to the (second|third|fourth) image \(pose map\)/.exec(
      prompt
    )?.[1];
  return word ? { second: 2, third: 3, fourth: 4 }[word as 'second' | 'third' | 'fourth'] : null;
}

/** A custom POSE FIRST line pointed at the map that draws it, as the planned lines are. */
function customPoseFirstLineWithMap(line: string, image: number | null): string {
  return line && image
    ? line.replace(/\.$/, `, exactly as the pose map in Image ${image} shows.`)
    : line;
}

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
  // Not "standing" on a lying still: the plate's stance pulled lying beats upright. Nor on a
  // seated / kneeling / crouching one (a seated toast stood up with it).
  // Nor on a custom pose: the joints say how she stands, lies or kneels, not the beat.
  const dressedStance =
    Boolean(facts.customPose?.trim()) ||
    dayStillLiesDown({
      beat: facts.beat,
      layout: facts.pose?.layout,
      figures: facts.pose?.figures || (facts.partner ? 2 : 1),
    }) ||
    /\b(?:sit|sits|sitting|seated|perch(?:ed|es|ing)?|kneel(?:s|ing)?|knelt|crouch(?:es|ing)?|squat(?:s|ting)?)\b/i.test(
      facts.beat ?? ''
    ) ||
    /\b(?:sit|perch|kneel|crouch|squat)/i.test(facts.pose?.layout ?? '')
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
    // The implied-nudity couple (Suggestive) is written for the pair too.
    !/ together, (?:both fully clothed, (?:affectionate|both fully in frame)|affectionate\. Implied nudity only:)/.test(
      basePrompt
    ) &&
    !(facts.adult && leadHeadcount >= 2);
  // The whole finished prompt is swapped later; the partner line names the partner's own gender,
  // so it goes in pre-swapped (the swap turns it back).
  const forLead = (text: string) => (swapLead && text ? swapDayPromptGender(text) : text);
  // Piggyback / head on a shoulder: placed body by body in a clothed two-person recipe, after the
  // Moment — the map alone, or the generic cue, drew a front carry and two tilted heads
  // (dayDuoPoseWords). Not on the long brief: on Rapid's two-person brief the same words as the
  // cue line changed nothing (piggyback 3/4 both, head on a shoulder 0/4 both; live 2026-10-05).
  // With no pose map (Qwen-Image 2.1) every cued two-person layout is said in words: Turbo drew
  // the selfie arm 8/8 with "she holds a phone out at arm length toward both faces", 0/8 from
  // the beat alone; head on a shoulder 2/2 (live 2026-10-17).
  const duoWords =
    recipe && figures >= 2 && !facts.adult && !facts.customPose?.trim()
      ? (dayDuoPoseWords(drawnLayout, dayDuoNames(facts, basePrompt, swapLead), facts.beat) ??
        (facts.poseFirstWithoutMap && drawnLayout && ALWAYS_CUED_DUO_LAYOUTS.has(drawnLayout)
          ? (poseLayoutCue(drawnLayout)?.replace(
              /\bthe lead\b/,
              facts.leadNoun === 'man' ? 'he' : 'she'
            ) ?? null)
          : null))
      : null;
  // A layout cue's "on the floor" is the Setting's ground outdoors (sit_floor on a rooftop deck).
  const poseCueLine =
    duoWords || !cueLine ? '' : facts.adult ? cueLine : withSceneGround(cueLine, facts.setting);
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
  // A custom pose leads with its own words: in the recipe's Pose: sentence, or as the brief's
  // first line. Edit 2511 and Rapid take the pose from the words, not the map (live A/B,
  // 2026-10-03).
  const customPose = facts.customPose?.trim() || '';
  const posedBase = !customPose
    ? recipeCue
      ? groundedPoseSentence(
          withPickedPostureCue(
            withRecipePoseCue(basePrompt, drawnLayout, facts.pose?.poseKey),
            facts.poseFirstWithoutMap ? facts.pickedPosture : null
          ),
          facts.adult ? null : facts.setting
        )
      : facts.sportActionCue && !recipe && figures === 1
        ? withSportActionPoseCue(basePrompt, drawnLayout)
        : duoWords
          ? withDuoRecipePoseSentence(basePrompt, duoWords)
          : basePrompt
    : recipe
      ? withCustomPoseSentence(basePrompt, customPose)
      : basePrompt;
  // The player's camera wins over the one Day would pick for this slot.
  const pickedCameraLine = cameraChoiceLine(facts.pickedCamera);
  const prompt = [
    customPose && !recipe ? customPoseFirstLine(customPose) : '',
    // The picked footwear replaces the automatic "shoes that suit the outfit" line.
    ...clothedLeadLines.filter(
      line => !(facts.footwear && /^She wears shoes that suit/.test(line))
    ),
    withFootwearLine(
      pickedCameraLine
        ? withPickedCameraLine(
            posedBase,
            facts.pickedCamera,
            figures >= 2 || facts.partner
              ? 'them'
              : facts.leadNoun === 'man' && !swapLead
                ? 'him'
                : 'her'
          )
        : facts.camera && recipe && !facts.adult && figures === 1
          ? posedBase.replace(
              /(Day photo: [^\n]*?\.)/,
              `$1 ${DAY_STILL_CAMERA_LINES[facts.camera]}`
            )
          : posedBase,
      // Shoes on auto: the recipe prompts named none and the Cast plate is barefoot, so she went
      // barefoot outdoors — name a pair that suits the outfit and the place (dayAutoFootwear).
      facts.footwear ||
        (recipe && !facts.adult && !facts.pickedShoes?.trim()
          ? (dayAutoFootwear({
              beat: facts.beat,
              setting: facts.setting,
              outfit: facts.leadOutfit,
              dayMood: facts.dayMood,
              lead: facts.leadNoun,
            }) ?? '')
          : ''),
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
    // How the pair relate (cast-relationships.ts): a sibling duo read as a date without it.
    facts.partner?.relation ? castRelationSentence(facts.partner.relation) : '',
    poseCueLine,
    lookLine,
    // Her tattoo / scar / glasses, when that part of her shows (cast-marks.ts).
    facts.leadMarks?.trim() || '',
    facts.leadProps?.trim() || '',
    facts.kleinFace ? KLEIN_FACE_REFERENCE_LINE : '',
    qualityNudge ? `QUALITY FIX: ${qualityNudge}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  // Qwen-Image 2.1 drops the planner's own maps, so for those the words are the only pose it gets:
  // they lead, in every mood. The adult exception is Edit 2511's, measured with its map.
  // A custom pose leads with its own words on every engine that leads with POSE FIRST (its map is
  // attached on all of them): in the recipe's Pose: sentence alone, mid-prompt after a standing
  // dressed plate, Edit 2511 drew a plank standing with arms up 4/4, a lie propped up, and back
  // views facing the camera (pose bench, 2026-10-21).
  const wordsOnly = facts.poseFirstWithoutMap === true;
  const poseFirstLine =
    customPose && recipe && (wordsOnly || facts.poseFirst)
      ? customPoseFirstLineWithMap(
          customPoseFirstLine(customPose, facts.leadNoun === 'man' && !swapLead ? 'he' : 'she'),
          wordsOnly ? null : recipePoseMapImage(prompt)
        )
      : facts.sportActionCue && wordsOnly && !recipe && figures === 1 && !customPose
        ? sportPoseFirstLine(prompt, drawnLayout)
        : facts.poseFirst &&
            recipe &&
            (figures === 1 || figures === 2 || (wordsOnly && figures <= 1)) &&
            !customPose &&
            (!facts.adult || wordsOnly)
          ? dayPoseFirstLine(prompt, { withoutMap: facts.poseFirstWithoutMap })
          : '';
  const joined = poseFirstLine ? `${poseFirstLine}\n${prompt}` : prompt;
  return {
    prompt: pickedCameraLine ? withoutConflictingFraming(joined, facts.pickedCamera) : joined,
    cued: Boolean(poseCueLine || duoWords),
    swapLead,
    recipe: isRapidDuoRecipePrompt(prompt),
  };
}

/** The recipe's "Pose: …" sentence with its floor said as the Setting's ground (withSceneGround). */
/**
 * A picked plain posture in words, for a one-person recipe on an engine that drops the planner's
 * map (Qwen-Image 2.1). The pick was drawn on the map only, so "Sit" with a beat that names no
 * posture came out standing (camera bench, 2026-10-22: a sit pick stood on Turbo; with
 * "Pose: seated, knees bent" she sat on the bench). Standing is the default and says nothing.
 */
const PICKED_POSTURE_CUES: Record<string, string> = {
  walk: 'walking mid-step, one foot ahead of the other',
  run: 'running mid-stride, one foot off the ground',
  sit: 'seated, knees bent',
  crouch: 'crouching low, knees deeply bent',
  kneel: 'kneeling on the ground',
  reach: 'reaching up high with one arm',
  lean: 'leaning with her shoulder and hip against something solid beside her',
  lie: 'lying on the back, whole body horizontal',
  jump: 'in mid-air, both feet off the ground, knees tucked up',
};

export function withPickedPostureCue(prompt: string, posture: string | null | undefined): string {
  const cue = posture ? PICKED_POSTURE_CUES[posture] : undefined;
  if (!cue || /\bPose: /.test(prompt)) return prompt;
  const sentence = `Pose: ${cue}. `;
  if (prompt.includes(' Place: ')) return prompt.replace(' Place: ', ` ${sentence}Place: `);
  return prompt.includes(' Moment: ')
    ? prompt.replace(' Moment: ', ` ${sentence}Moment: `)
    : prompt;
}

function groundedPoseSentence(prompt: string, setting: string | null | undefined): string {
  if (!setting?.trim()) return prompt;
  return prompt.replace(/\bPose: [^\n]*?\.(?= |$)/m, sentence =>
    withSceneGround(sentence, setting)
  );
}

/**
 * How the prompt names the two people, in its own voice: the long brief and the swapped prompts
 * are written for a woman lead; the couple recipes for a man lead are his already. A same-sex
 * partner keeps the name the prompt gave them ("her friend", "her girlfriend").
 */
export function dayDuoNames(
  facts: Pick<DayStillPromptFacts, 'leadNoun' | 'partner'>,
  prompt: string,
  swapLead: boolean
): DuoPoseNames {
  const leadMan = facts.leadNoun === 'man';
  const voiceLeadMan = leadMan && !swapLead;
  const partnerNoun = facts.partner?.noun ?? (leadMan ? 'woman' : 'man');
  const flip = (noun: DayPartnerNoun): DayPartnerNoun =>
    noun === 'man' ? 'woman' : noun === 'woman' ? 'man' : noun;
  const voicePartner = swapLead ? flip(partnerNoun) : partnerNoun;
  const lead = voiceLeadMan ? 'he' : 'she';
  const leadPossessive = voiceLeadMan ? 'his' : 'her';
  if (voicePartner === (voiceLeadMan ? 'man' : 'woman') || voicePartner === 'person') {
    const named = new RegExp(
      `\\b${leadPossessive} (?:girlfriend|boyfriend|friend|partner)\\b`
    ).exec(prompt);
    return { lead, partner: named?.[0] ?? `${leadPossessive} friend` };
  }
  return { lead, partner: voicePartner === 'man' ? 'he' : 'she' };
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
    /**
     * The one requeue after the adult check saw bare skin on a clothed-mood still: the strong
     * coverage line leads the prompt (clothed-coverage.ts). Clothed moods only.
     */
    coverage?: boolean;
  }
): string {
  const swapped = finishDayStillWording(drafted, input);
  const ages = input.ages;
  // The coverage line alone left the report card's leaking stills nude (10 of 10 on replay); the
  // bare-skin words in the beat are what undress her, so the requeue changes those too.
  const covered =
    input.coverage && dayMoodMustStayClothed(ages?.playedMood)
      ? withStrongCoverageLine(softenBareSkinWords(swapped))
      : swapped;
  if (!ages || !dayMoodNeedsAdultSafeguards(ages.playedMood)) return covered;
  return applyAdultAgeSafeguards(covered, {
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

function withAdultBody(descriptor: string | undefined, adultBody: string): string | undefined {
  if (!adultBody) return descriptor;
  return descriptor?.trim() ? `${descriptor.trim()}, with ${adultBody}` : adultBody;
}

/** The mood a still plays as. */
export function dayPlayedMood(dayMood: string | null | undefined, intimateEnabled: boolean) {
  return normalizeDayMood(isDayAdultMood(dayMood) && !intimateEnabled ? 'everyday' : dayMood);
}

/**
 * The slot as one still is made from it: on a clothed still, the beat's furniture fitted to the
 * Setting (scene-surface.ts). Everyday and Suggestive draw the beat and the Setting separately,
 * and a beat names its own furniture — "lying on her side on the sofa" went out with a busy plaza
 * and painted a sofa onto it (Castcut_02403). A lying beat where there is nowhere to lie becomes
 * a sit there. Adult moods keep their beats (their settings are indoor rooms already). The slot
 * itself is not changed; a typed beat stays typed.
 */
export function dayStillSceneSlot<
  T extends { location?: string; sceneHints?: string; sceneHintsTyped?: string },
>(
  slot: T,
  context: { dayMood: string | null | undefined; intimateEnabled: boolean; lockedLocation?: string }
): T {
  const hints = slot.sceneHints;
  if (!hints?.trim() || isDayAdultMood(dayPlayedMood(context.dayMood, context.intimateEnabled))) {
    return slot;
  }
  // Furniture fitted to the place, and a fork / chopsticks / spoon for food she eats (pasta
  // twirled with no fork named was eaten by hand).
  const fitted = withEatingUtensil(
    fitBeatToSetting(hints, resolveRoleplaySetting(slot.location, context.lockedLocation))
  );
  if (fitted === hints) return slot;
  return {
    ...slot,
    sceneHints: fitted,
    ...(slot.sceneHintsTyped && slot.sceneHintsTyped === hints ? { sceneHintsTyped: fitted } : {}),
  };
}

/**
 * A beat the Day drew (not one the player typed) that its Setting still cannot host after
 * {@link dayStillSceneSlot} — cooking at the stove on a street: the queue draws the slot a new
 * scene instead. Returns the slot patch that clears what is to be drawn again (Vacation, Sport and
 * the themes draw beat and venue as a pair; Everyday and Suggestive keep the Setting and draw a
 * beat that fits it), or null when the beat can stay.
 */
export function dayStillSceneRedraw(
  slot: { location?: string; sceneHints?: string; sceneHintsTyped?: string },
  context: {
    dayMood: string | null | undefined;
    intimateEnabled: boolean;
    lockedLocation?: string;
    /** The Day draws beat and venue together (Vacation, Sport, a theme). */
    pairedScenes: boolean;
  }
): { sceneHints: undefined; sceneHintsTyped: undefined; location?: undefined } | null {
  const hints = slot.sceneHints?.trim();
  if (
    !hints ||
    dayBeatIsTyped(slot) ||
    isDayAdultMood(dayPlayedMood(context.dayMood, context.intimateEnabled))
  ) {
    return null;
  }
  const setting = resolveRoleplaySetting(slot.location, context.lockedLocation);
  if (beatFitsSetting(hints, setting)) return null;
  return context.pairedScenes && !context.lockedLocation?.trim()
    ? { sceneHints: undefined, sceneHintsTyped: undefined, location: undefined }
    : { sceneHints: undefined, sceneHintsTyped: undefined };
}

/**
 * A slot's brief or recipe for one still: what `buildDaySlotPrompt` needs, decided from the Day
 * state and what the queue has attached. The Day hook and the finished-prompt sweep both call
 * this, so a rule changed here is the rule that is tested.
 */
export { dayBeatIsTyped } from '@/lib/day/planner';

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
  // Her home and office look the same in every still (cast-places.ts). Clothed moods only: the
  // adult recipes pick and write their own rooms (live 2026-10-09: the place never reached an
  // Intimate prompt), and they are short on purpose. Written for a woman like the rest of the
  // brief — a man lead's prompt is swapped whole.
  const setting = resolveRoleplaySetting(beatSlot.location, state.lockedLocation);
  const placed = isDayAdultMood(dayMood) ? setting : withCastPlace(setting, state.character);
  const placedSlot = placed && placed !== setting ? { ...beatSlot, location: placed } : beatSlot;
  return buildDaySlotPrompt({
    // Weather / season rides on the Setting (SCENE lead, SETTING line, recipe room).
    slot: state.dayWeather
      ? { ...placedSlot, location: withDayWeather(placedSlot.location, state.dayWeather) }
      : placedSlot,
    wardrobeLabel: state.wardrobeLabel,
    characterName: state.character?.name,
    characterDescriptor: withAdultBody(
      state.character?.descriptor || state.character?.hints,
      // Nude Intimate / Raunchy stills only: pubic hair is never in the description itself.
      isDayAdultMood(dayMood) && omitGarment ? adultBodyPhrase(state.character?.traits) : ''
    ),
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

/**
 * A nude one-person still on Qwen-Image 2.1 with the Cast's undressed plate as the second image:
 * her body from the picture, not from words. Turbo, a curvy Cast with a sleeve tattoo whose
 * traits did not say so (2026-10-18): the face crop alone slimmed her and lost or moved the
 * tattoo 8/8; with the plate her own figure and the tattoo 8/8, no underwear 8/8.
 */
export function withNudeBodyPlateLine(prompt: string, man = false): string {
  const her = man ? 'his' : 'her';
  const line = `${man ? 'His' : 'Her'} body is the second image (the same ${man ? 'man' : 'woman'}): keep ${her} figure, build, chest, belly, hips, thighs and skin, with any tattoos or marks, exactly as in the second image. The underwear there is only the fitting base — ${man ? 'he' : 'she'} wears nothing here; never the plain studio wall.`;
  if (prompt.includes(line)) return prompt;
  const face = new RegExp(`Keep ${her} face from the first image[.;]`);
  return face.test(prompt)
    ? prompt.replace(face, match => `${match} ${line}`)
    : `${prompt.trim()} ${line}`;
}

/**
 * A nude two-person still on Qwen-Image 2.1 (oral, touching — sex layouts go to Rapid) with the
 * lead's undressed Cast plate as one more picture after the two faces: her body from it, as a
 * nude solo's (withNudeBodyPlateLine). Turbo, the user's oral duos, same seeds (2026-10-19):
 * build closer to a slim plate than the words alone, 0/28 pasted photo, wall or extra person.
 */
export function withNudeDuoLeadBodyLine(
  prompt: string,
  man = false,
  image: 'third' | 'fourth' | 'fifth' = 'third'
): string {
  const her = man ? 'his' : 'her';
  const line = `${man ? 'His' : 'Her'} body is the ${image} image (the same ${man ? 'man' : 'woman'}): keep ${her} figure, build, chest, belly, hips, thighs and skin, with any tattoos or marks, exactly as in the ${image} image. The underwear there is only the fitting base — ${man ? 'he' : 'she'} wears nothing here; never paste that photo or its plain wall into the scene.`;
  if (prompt.includes(line)) return prompt;
  const face = new RegExp(`Keep ${her} face from the first image[^.]*\\.`);
  return face.test(prompt)
    ? prompt.replace(face, match => `${match} ${line}`)
    : `${prompt.trim()} ${line}`;
}

/**
 * A clothed two-person still on Qwen-Image 2.1 with the lead's dressed plate as the third image
 * (the two faces are Images 1 and 2; the fourth when the pose map, which 2.1 drops, is the third):
 * her body and outfit from the picture. Turbo, a curvy Cast
 * with a sleeve tattoo her traits did not mention (2026-10-18): the faces alone gave a vaguer
 * figure, the tattoo now and then and a generic dress; with the plate her build, the tattoo 8/8
 * and the dress's own detail.
 */
export function withDuoLeadBodyLine(
  prompt: string,
  man = false,
  image: 'third' | 'fourth' = 'third'
): string {
  const her = man ? 'his' : 'her';
  const line = `${man ? 'His' : 'Her'} body and clothes are the ${image} image: ${her} figure, build, skin with any tattoos or marks, and ${her} outfit exactly as in the ${image} image — never paste that photo or its plain wall into the scene.`;
  if (prompt.includes(line)) return prompt;
  const face = new RegExp(`Keep ${her} face from the first image[^.]*\\.`);
  return face.test(prompt)
    ? prompt.replace(face, match => `${match} ${line}`)
    : `${prompt.trim()} ${line}`;
}

/**
 * A clothed two-person still on Qwen-Image 2.1 with the partner Cast's dressed plate (or their
 * Outfit Keep) as one more picture: the partner's body and outfit from it, as the lead's
 * (withDuoLeadBodyLine). After the lead's line, else after the faces sentence.
 */
export function withDuoPartnerBodyLine(
  prompt: string,
  partner: 'man' | 'woman',
  image: 'third' | 'fourth' | 'fifth'
): string {
  const their = partner === 'man' ? 'his' : 'her';
  const pronoun = partner === 'man' ? 'he' : 'she';
  const line = `The ${partner}'s body and clothes are the ${image} image: ${their} figure, build, skin and ${their} outfit exactly as in the ${image} image — never paste that photo or its plain wall into the scene.`;
  if (prompt.includes(line)) return prompt;
  // The outfit words defer to the picture: "…; he wears a casual shirt and jeans." fought the
  // partner's suit (a green shirt and jeans came out, 9/9).
  prompt = prompt.replace(
    new RegExp(`;\\s*${pronoun} wears [^.;]+\\.`),
    `; ${pronoun} wears the outfit shown in the ${image} image.`
  );
  const after =
    /(?:Her|His) body and clothes are the (?:third|fourth) image:[^—]*— never paste that photo or its plain wall into the scene\./;
  if (after.test(prompt)) return prompt.replace(after, match => `${match} ${line}`);
  const face = /Keep (?:her|his) face from the first image[^.]*\./;
  return face.test(prompt)
    ? prompt.replace(face, match => `${match} ${line}`)
    : `${prompt.trim()} ${line}`;
}
