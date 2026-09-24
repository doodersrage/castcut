/**
 * Flat mannequin pose guides for Day / Story Image 3.
 * Qwen Edit Plus already encodes image1–4; Image 3 supplies layout without
 * fighting Keep/Cast (Image 1) or the clothing packshot (Image 2).
 *
 * Day keeps canned slot skeletons. Story synthesizes a fresh stance from
 * the beat title/blurb/prompt (stable hash → same beat redraws the same pose).
 * Figures are drawn as filled limb capsules (mannequin mass) so duo overlap and
 * contact read clearly — still face-free / clothing-free.
 */

import type { DaySlotId } from '@/lib/day-planner';
import {
  clarifyIntimateImageLanguage,
  intimateTextImpliesCabinetDrawer,
  intimateTextImpliesSurfaceBent,
} from '@/lib/intimate-prompt-clarify';
import {
  drawOpenPoseFigures,
  mirrorPoseFacing,
  resolvePoseLeadPosition,
  type PoseFacing,
  type PoseLeadPosition,
} from '@/lib/pose-guide-openpose';
import {
  normalizePoseGuideStylePreference,
  usesOutlineGrayPoseGuide,
  type PoseGuideStylePreference,
} from '@/lib/pose-guide-prompt';

type Point = { x: number; y: number };

/** Normalized 0–1 skeleton joints for a full-body pose figure. */
export type StickSkeleton = {
  head: Point;
  neck: Point;
  pelvis: Point;
  lShoulder: Point;
  rShoulder: Point;
  lElbow: Point;
  rElbow: Point;
  lWrist: Point;
  rWrist: Point;
  lHip: Point;
  rHip: Point;
  lKnee: Point;
  rKnee: Point;
  lAnkle: Point;
  rAnkle: Point;
  /** Head direction for OpenPose face points; inferred from joint geometry when unset. */
  facing?: PoseFacing;
};

const WIDTH = 512;
const HEIGHT = 768;

const POSE_KEYS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type PoseGuideKey = (typeof POSE_KEYS)[number];

export type PoseGuideBase =
  'stand' | 'walk' | 'run' | 'sit' | 'crouch' | 'kneel' | 'reach' | 'lean' | 'lie' | 'jump';

/**
 * Intimate duo/trio/solo layouts (crude wireframe only — no anatomy detail).
 * Distinct silhouettes so Story Image 3 can unlock stance variety for adult beats.
 */
export type IntimateLayout =
  | 'missionary'
  | 'mating_press'
  | 'straddle'
  | 'reverse_straddle'
  | 'bent'
  | 'prone'
  | 'spoon'
  | 'scissors'
  | 'standing'
  | 'wall'
  | 'lift'
  | 'oral'
  | 'sixty_nine'
  | 'facesit'
  | 'kneeling'
  | 'lap'
  | 'afterglow'
  | 'undress'
  | 'solo'
  | 'generic';

const INTIMATE_SOLO_LAYOUTS: ReadonlySet<IntimateLayout> = new Set(['solo']);

/**
 * Non-intimate duo/solo layouts that need more than base+arms
 * (close embrace, dance frame, spar, climb, phone, look-back, everyday Day stances,
 * Day Sport mid-action athletic silhouettes).
 */
export type SocialLayout =
  | 'hug'
  | 'dance'
  | 'fight'
  | 'climb'
  | 'phone'
  | 'look_back'
  | 'wave'
  | 'cross_arms'
  | 'pockets'
  | 'stretch'
  | 'drink'
  | 'carry'
  | 'read'
  | 'rail'
  | 'point'
  | 'hands_hips'
  | 'bend_pick'
  | 'foot_up'
  | 'lean_wall'
  | 'hair_touch'
  | 'shrug'
  | 'stairs'
  | 'sport_sprint'
  | 'sport_yoga_warrior'
  | 'sport_yoga_dog'
  | 'sport_cycle'
  | 'sport_swing'
  | 'sport_serve'
  | 'sport_forehand'
  | 'sport_jump_shot'
  | 'sport_kick'
  | 'sport_throw'
  | 'sport_lunge'
  | 'sport_handstand'
  | 'sport_pitch'
  | 'sport_stick'
  | 'sport_block'
  | 'sport_hurdle'
  | 'sport_slide'
  | 'sport_dunk'
  | 'sport_ski'
  | 'sport_putt'
  | 'sport_overhead'
  | 'sport_swim'
  | 'sport_spike'
  | 'sport_box'
  | 'sport_surf';

const SPORT_SOLO_LAYOUTS: readonly SocialLayout[] = [
  'sport_sprint',
  'sport_yoga_warrior',
  'sport_yoga_dog',
  'sport_cycle',
  'sport_swing',
  'sport_serve',
  'sport_forehand',
  'sport_jump_shot',
  'sport_kick',
  'sport_throw',
  'sport_lunge',
  'sport_handstand',
  'sport_pitch',
  'sport_stick',
  'sport_block',
  'sport_hurdle',
  'sport_slide',
  'sport_dunk',
  'sport_ski',
  'sport_putt',
  'sport_overhead',
  'sport_swim',
  'sport_spike',
  'sport_box',
  'sport_surf',
];

const SOCIAL_SOLO_LAYOUTS: ReadonlySet<SocialLayout> = new Set([
  'climb',
  'phone',
  'look_back',
  'wave',
  'cross_arms',
  'pockets',
  'stretch',
  'drink',
  'carry',
  'read',
  'rail',
  'point',
  'hands_hips',
  'bend_pick',
  'foot_up',
  'lean_wall',
  'hair_touch',
  'shrug',
  'stairs',
  ...SPORT_SOLO_LAYOUTS,
]);

function isSportSocialLayout(layout: SocialLayout): boolean {
  return layout.startsWith('sport_');
}

export type PoseGuideArm = 'down' | 'out' | 'up' | 'forward' | 'hold' | 'crossed';

export type PoseGuideIntent = {
  base: PoseGuideBase;
  armLeft: PoseGuideArm;
  armRight: PoseGuideArm;
  /** -1 left lean … +1 right lean */
  lean: number;
  /** 0 closed stance … 1 wide stride */
  stride: number;
  /** Stable variation seed from scene text. */
  seed: number;
  label: string;
  /** How many stick figures to draw (1–3). */
  people: number;
  /** Sex-scene layout when the beat is intimate. */
  intimate?: IntimateLayout | null;
  /** Non-intimate dedicated layout (hug/dance/everyday Day stances). */
  social?: SocialLayout | null;
  /** Original scene copy for pronoun/role ordering. */
  sceneText?: string;
};

/** Slot-default stick poses — crude but distinct stances for morning→night. */
const SLOT_SKELETONS: Record<PoseGuideKey, StickSkeleton> = {
  morning: {
    // Stretch / reach — arms overhead (not a fashion stand).
    head: { x: 0.5, y: 0.1 },
    neck: { x: 0.5, y: 0.18 },
    pelvis: { x: 0.5, y: 0.48 },
    lShoulder: { x: 0.38, y: 0.22 },
    rShoulder: { x: 0.62, y: 0.22 },
    lElbow: { x: 0.34, y: 0.14 },
    rElbow: { x: 0.66, y: 0.12 },
    lWrist: { x: 0.36, y: 0.06 },
    rWrist: { x: 0.64, y: 0.05 },
    lHip: { x: 0.44, y: 0.48 },
    rHip: { x: 0.56, y: 0.48 },
    lKnee: { x: 0.42, y: 0.66 },
    rKnee: { x: 0.58, y: 0.64 },
    lAnkle: { x: 0.4, y: 0.86 },
    rAnkle: { x: 0.6, y: 0.84 },
  },
  afternoon: {
    // Carry / walk — mid-stride with one arm lower (bag side).
    head: { x: 0.52, y: 0.11 },
    neck: { x: 0.5, y: 0.19 },
    pelvis: { x: 0.48, y: 0.47 },
    lShoulder: { x: 0.4, y: 0.23 },
    rShoulder: { x: 0.62, y: 0.22 },
    lElbow: { x: 0.32, y: 0.38 },
    rElbow: { x: 0.7, y: 0.34 },
    lWrist: { x: 0.28, y: 0.52 },
    rWrist: { x: 0.76, y: 0.44 },
    lHip: { x: 0.44, y: 0.47 },
    rHip: { x: 0.54, y: 0.47 },
    lKnee: { x: 0.36, y: 0.64 },
    rKnee: { x: 0.62, y: 0.66 },
    lAnkle: { x: 0.28, y: 0.84 },
    rAnkle: { x: 0.7, y: 0.86 },
  },
  evening: {
    // Drink / seated lean — higher pelvis, glass toward face.
    head: { x: 0.48, y: 0.22 },
    neck: { x: 0.48, y: 0.3 },
    pelvis: { x: 0.5, y: 0.58 },
    lShoulder: { x: 0.36, y: 0.34 },
    rShoulder: { x: 0.6, y: 0.32 },
    lElbow: { x: 0.3, y: 0.46 },
    rElbow: { x: 0.64, y: 0.4 },
    lWrist: { x: 0.36, y: 0.56 },
    rWrist: { x: 0.58, y: 0.34 },
    lHip: { x: 0.44, y: 0.58 },
    rHip: { x: 0.56, y: 0.58 },
    lKnee: { x: 0.4, y: 0.72 },
    rKnee: { x: 0.68, y: 0.7 },
    lAnkle: { x: 0.38, y: 0.88 },
    rAnkle: { x: 0.74, y: 0.78 },
  },
  night: {
    // Pockets / lean pause — weight on one leg, hands at hip pockets.
    head: { x: 0.54, y: 0.14 },
    neck: { x: 0.52, y: 0.22 },
    pelvis: { x: 0.48, y: 0.5 },
    lShoulder: { x: 0.4, y: 0.26 },
    rShoulder: { x: 0.64, y: 0.24 },
    lElbow: { x: 0.36, y: 0.4 },
    rElbow: { x: 0.68, y: 0.38 },
    lWrist: { x: 0.42, y: 0.5 },
    rWrist: { x: 0.58, y: 0.5 },
    lHip: { x: 0.42, y: 0.5 },
    rHip: { x: 0.54, y: 0.5 },
    lKnee: { x: 0.44, y: 0.68 },
    rKnee: { x: 0.62, y: 0.66 },
    lAnkle: { x: 0.44, y: 0.88 },
    rAnkle: { x: 0.72, y: 0.84 },
  },
};

function px(point: Point): { x: number; y: number } {
  return { x: point.x * WIDTH, y: point.y * HEIGHT };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic 0..1 from seed + salt (mulberry32-ish). */
function seededUnit(seed: number, salt: number): number {
  let t = (seed + salt * 0x9e3779b9) >>> 0;
  t += 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Infer stick-figure count from scene copy. Caps at 3 so the wireframe stays readable.
 * Prefers explicit duo/crowd cues over bare "they" (often singular in Story blurbs).
 */
export function countPoseGuidePeople(text: string | null | undefined): number {
  const haystack = text?.trim() || '';
  if (!haystack) {
    return 1;
  }
  if (
    /\b(threesome|three[- ]way|mmf|ffm|mmm|fff|spit[- ]?roast|double\s+team|crowd|group of|among (?:the )?crowd|three (?:people|persons|figures|friends|strangers|lovers)|a trio)\b/i.test(
      haystack
    )
  ) {
    return 3;
  }
  if (
    /\b(duo|pair|couple|both of (?:you|them)|the two|two (?:people|persons|figures|strangers|friends|lovers|adults)|knee[- ]to[- ]knee|face[- ]to[- ]face|side by side|arm in arm|hand in hand|each other|one another)\b/i.test(
      haystack
    )
  ) {
    return 2;
  }
  if (
    /\bwith (?:a |an |the )?(?:stranger|friend|partner|rival|enemy|lover|guest|newcomer|companion|roommate|second person|other (?:person|figure)|someone(?: else)?)\b/i.test(
      haystack
    )
  ) {
    return 2;
  }
  // Bare partner / second adult without requiring "with a …"
  if (
    /\b(?:a |an |the )?(?:partner|lover|stranger|companion|roommate|second (?:person|adult)|other (?:person|figure))\b/i.test(
      haystack
    )
  ) {
    return 2;
  }
  if (
    /\b(?:hug(?:s|ging)?|embrace(?:s|d|ing)?|kiss(?:es|ing)?|argue(?:s|ing)?|talk(?:s|ing)?|speak(?:s|ing)?|dance(?:s|ing)?|fight(?:s|ing)?|chase(?:s|ing)?|confront(?:s|ing)?|fuck(?:s|ing)?|screw(?:s|ing)?|rail(?:s|ing)?|breed(?:s|ing)?)\s+(?:with|to|against)\b/i.test(
      haystack
    )
  ) {
    return 2;
  }
  if (
    /\b(sex|sexual|intercourse|make\s+love|lovemaking|hook(?:ing)?\s+up|get(?:ting)?\s+it\s+on|climax|orgasm|penetrat(?:e|es|ed|ing|ion)?|thrust(?:s|ing)?|grind(?:s|ing)?|mount(?:s|ing|ed)?|straddl(?:e|es|ed|ing)?|cowgirl|missionary|doggy|from\s+behind|on\s+top|underneath|oral|cunnilingus|fellatio|clit|fingering)\b/i.test(
      haystack
    )
  ) {
    return 2;
  }
  // Literary duo: she/her + he/him with intimate contact cues
  if (
    /\b(she|her)\b/i.test(haystack) &&
    /\b(he|him|his)\b/i.test(haystack) &&
    /\b(kneel|tongue|laps?|lick|finger|clit|thigh|beside|bent|barefoot)\b/i.test(haystack)
  ) {
    return 2;
  }
  if (/\band (?:another|a second|someone else)\b/i.test(haystack)) {
    return 2;
  }
  return 1;
}

/** Standing press against a wall / glass / door (the `wall` layout). */
const WALL_PRESS_RE =
  /\b(against\s+(?:the\s+)?(?:[\w'-]+\s+){0,4}(?:wall|glass|window|door)|wall\s+(?:sex|fuck|pin)|rear\s+wall\s+press|wall\s+press|pinned\s+against|press(?:es|ed|ing)?\s+(?:her|him|them)\s+(?:back|against)|lean(?:s|ing)?\s+against.{0,48}wall|elevator\s+(?:sex|fuck|wall)|glass\s+elevator)\b/i;

/** Wording that makes a body fold forward (bent layout) even when a wall is named. */
const BENT_BODY_RE =
  /\b(doggy(?:[- ]style)?|bent\s+over|bend(?:s|ing)?\s+over|curled?\s+over|ass[- ]up|all\s+fours|hands\s+and\s+knees|over\s+the\s+(?:desk|table|counter|edge|ledgers?|stack|chair|sofa|couch|bed))\b/i;

/**
 * Map adult scene copy to an intimate wireframe layout.
 * Stick figures stay crude — stance/placement only, no anatomy.
 * More specific cues win; order matters.
 */
export function parseIntimateLayout(text: string | null | undefined): IntimateLayout | null {
  const haystack = text?.trim() || '';
  if (!haystack) {
    return null;
  }

  if (/\b(69|sixty[- ]?nine|mutual\s+oral|head[- ]to[- ]crotch|sixty\s+nine)\b/i.test(haystack)) {
    return 'sixty_nine';
  }
  if (
    /\b(face[- ]?sit(?:ting|s)?|sitting\s+on\s+(?:their|her|his)\s+face|on\s+(?:their|her|his)\s+face)\b/i.test(
      haystack
    )
  ) {
    return 'facesit';
  }
  if (
    /\b(mating\s+press|legs?\s+(?:over|behind)\s+(?:the\s+)?(?:shoulders?|head)|folded\s+in\s+half|piledriver)\b/i.test(
      haystack
    )
  ) {
    return 'mating_press';
  }
  if (
    /\b(reverse\s+cowgirl|reverse\s+straddl|facing\s+away\s+(?:while\s+)?(?:rid|straddl|mount)|back\s+to\s+(?:them|him|her)\s+(?:while\s+)?rid)\b/i.test(
      haystack
    )
  ) {
    return 'reverse_straddle';
  }
  // Solo / masturbation BEFORE missionary — "alone on her back touching herself"
  // used to match "on her back" and paint a duo Image 3 wireframe.
  if (
    /\b(masturbat(?:e|es|ing|ion)?|self[- ]pleasur|self[- ]touch|toy\s+play|vibrator|dildo|magic\s*wand)\b/i.test(
      haystack
    )
  ) {
    return 'solo';
  }
  if (
    /\b(solo|alone)\b/i.test(haystack) &&
    /\b(touch(?:ing)?\s+(?:themselves|herself|himself)|hands?\s+on\s+(?:her|his|their)\s+own|finger(?:ing)?|rub(?:bing)?\s+(?:herself|himself|themselves)|between\s+(?:her|his|their)\s+thighs|sex|sexual|naked|nude|erotic|intimate|climax|orgasm|pleasure|bare\s+skin|self[- ]pleasur|masturbat)\b/i.test(
      haystack
    )
  ) {
    return 'solo';
  }
  if (
    /\b(missionary|pinned\s+(?:down|beneath|under)|underneath|lying\s+under|on\s+top\s+of\s+(?:them|her|him))\b/i.test(
      haystack
    ) ||
    (/\bon\s+(?:their|her|his)\s+back\b/i.test(haystack) &&
      !/\b(solo|alone|masturbat|self[- ]pleasur|touch(?:ing)?\s+(?:herself|himself|themselves))\b/i.test(
        haystack
      ) &&
      /\b(partner|missionary|sex|fuck|mid-sex|lover|thrust)\b/i.test(haystack))
  ) {
    return 'missionary';
  }
  if (
    /\b(cowgirl|straddl(?:e|es|ing)|rid(?:e|es|ing)\s+(?:them|him|her)|mount(?:s|ing|ed)?)\b/i.test(
      haystack
    )
  ) {
    return 'straddle';
  }
  if (
    /\b(prone\s+bone|face[- ]down\s+(?:sex|fuck|screw)|flat\s+on\s+(?:their|her|his)\s+stomach|lying\s+face[- ]down)\b/i.test(
      haystack
    )
  ) {
    return 'prone';
  }
  // A wall/glass press "from behind" is the standing wall layout (partner behind, both upright);
  // only an explicit bend, all-fours, or surface lean keeps it bent over.
  if (WALL_PRESS_RE.test(haystack) && !BENT_BODY_RE.test(haystack)) {
    return 'wall';
  }
  if (
    /\b(doggy(?:[- ]style)?|from\s+behind|bent\s+over|bend(?:s|ing)?\s+over|curled?\s+over|ass[- ]up)\b/i.test(
      haystack
    ) ||
    (/\bover\s+the\s+(?:desk|table|counter|edge|ledgers?|stack)\b/i.test(haystack) &&
      /\b(sex|fuck|doggy|from\s+behind|partner|mid-sex|thrust)\b/i.test(haystack))
  ) {
    return 'bent';
  }
  if (/\b(spoon(?:ing|s)?|curled\s+behind|little\s+spoon|big\s+spoon)\b/i.test(haystack)) {
    return 'spoon';
  }
  if (
    /\b(scissor(?:s|ing)?|tribad|side[- ]entry|lying\s+side[- ]by[- ]side\s+(?:sex|fuck)|side[- ]lying\s+sex)\b/i.test(
      haystack
    )
  ) {
    return 'scissors';
  }
  if (WALL_PRESS_RE.test(haystack)) {
    return 'wall';
  }
  if (
    /\b(lift(?:ed|ing)?\s+(?:(?:them|her|him)\s+)?(?:up\s+)?(?:while\s+)?(?:fuck(?:s|ing|ed)?|screw(?:s|ing|ed)?|sex)|carry(?:ing)?\s+(?:(?:them|her|him)\s+)?(?:while\s+)?(?:fuck(?:s|ing|ed)?|screw(?:s|ing|ed)?|sex)|held\s+(?:up|aloft)|legs?\s+wrapped\s+around|picked\s+up\s+(?:and\s+)?(?:fuck|screw)|hangs?\s+suspended|suspend(?:ed|ing)|lower(?:s|ing)\s+(?:her|him|them)\s+(?:slowly\s+)?(?:into|onto)|into\s+a\s+(?:velvet\s+)?chaise|onto\s+a\s+(?:velvet\s+)?chaise)\b/i.test(
      haystack
    )
  ) {
    return 'lift';
  }
  if (
    /\b(oral|blow\s*job|blowjob|go(?:es|ing)\s+down|cunnilingus|fellatio|between\s+(?:their|her|his)\s+legs|on\s+(?:their|her|his)\s+knees\s+(?:for|in\s+front)|kneeling\s+(?:for|in\s+front|before)|tongue\s+(?:on|at|laps?|lapping|lick(?:s|ing)?)|laps?\s+at|lick(?:s|ing)?\s+(?:her|his|their)\s+(?:inner\s+)?(?:thigh|cock|penis|dick|clit)|fingers?\s+(?:on|around|curl(?:s|ing)?\s+(?:around|into))\s+(?:her|his|their)\s+clit|curl(?:s|ing)?\s+around\s+(?:her|his|their)\s+clit)\b/i.test(
      haystack
    )
  ) {
    return 'oral';
  }
  if (
    /\b(lap\s+sit|on\s+(?:their|her|his)\s+lap|sitting\s+on\s+(?:a\s+)?(?:lap|partner)|lotus\s+position|face[- ]to[- ]face\s+sit)\b/i.test(
      haystack
    )
  ) {
    return 'lap';
  }
  if (
    /\b(on\s+(?:their|her|his)\s+knees|kneeling)\b/i.test(haystack) &&
    /\b(sex|fuck|lover|naked|nude|intimate|climax|orgasm|thrust|grind|clit|thigh|barefoot|bent)\b/i.test(
      haystack
    ) &&
    !/\b(solo|alone|masturbat|self[- ]pleasur|touch(?:ing)?\s+(?:herself|himself|themselves))\b/i.test(
      haystack
    )
  ) {
    return 'kneeling';
  }
  if (
    /\b(afterglow|tangled\s+sheets|spent\s+together|soft\s+after|post[- ]?coital|lying\s+together\s+(?:naked|after)|cuddle(?:s|ing)?\s+naked)\b/i.test(
      haystack
    ) ||
    /\b(lies?\s+still|eyes?\s+closed).{0,100}\b(withdraw|afterglow|scent of (?:him|her|them))\b/i.test(
      haystack
    ) ||
    /\bwithdraw(?:s|ing)?\s+slowly\b/i.test(haystack) ||
    /^Drawer afterglow:/i.test(haystack)
  ) {
    return 'afterglow';
  }
  if (
    /\b(undress(?:ing|es)?|strip(?:ping|s)?|clothes\s+off|half[- ]undressed|unzip|lingerie\s+coming\s+off|pull(?:ing)?\s+(?:off|down)\s+(?:clothes|shirt|pants))\b/i.test(
      haystack
    ) &&
    /\b(skin|naked|nude|erotic|sex|heat|intimate|lover|bedroom|lingerie)\b/i.test(haystack)
  ) {
    return 'undress';
  }
  if (
    /\b(standing\s+sex|standing\s+(?:fuck|screw)|fuck(?:s|ing)?\s+standing|upright\s+sex|vertical\s+sex)\b/i.test(
      haystack
    )
  ) {
    return 'standing';
  }
  // Residual solo cues (after duo layouts) — keep for blurbs that skip earlier masturbation words.
  if (
    /\b(masturbat(?:e|es|ing|ion)?|self[- ]pleasur|self[- ]touch|toy\s+play|vibrator|dildo|magic\s*wand)\b/i.test(
      haystack
    )
  ) {
    return 'solo';
  }
  if (
    /\b(solo|alone)\b/i.test(haystack) &&
    /\b(touch(?:ing)?\s+(?:themselves|herself|himself)|hands?\s+on\s+(?:her|his|their)\s+own|finger(?:ing)?|between\s+(?:her|his|their)\s+thighs|sex|sexual|naked|nude|erotic|intimate|climax|orgasm|pleasure|bare\s+skin)\b/i.test(
      haystack
    )
  ) {
    return 'solo';
  }
  if (
    /\b(side[- ]lying)\b/i.test(haystack) &&
    /\b(sex|fuck|naked|intimate|lover)\b/i.test(haystack)
  ) {
    return 'spoon';
  }
  if (
    /\b(sex|sexual|intercourse|make\s+love|lovemaking|fuck(?:s|ing|ed)?|screw(?:s|ing|ed)?|rail(?:s|ed|ing)?\s+(?:her|him|them)|breed(?:s|ing|ed)?|hook(?:ing)?\s+up|get(?:ting)?\s+it\s+on|climax|orgasm|penetrat|thrust(?:s|ing)?|grind(?:s|ing)?|naked\s+together|in\s+bed\s+together|threesome|three[- ]way|mid[- ]?fuck|mid[- ]?sex|bodies?\s+(?:joined|close)|explicit\s+pose)\b/i.test(
      haystack
    )
  ) {
    return 'generic';
  }
  return null;
}

function intimateBaseForLayout(layout: IntimateLayout): PoseGuideBase {
  switch (layout) {
    case 'missionary':
    case 'mating_press':
    case 'prone':
    case 'spoon':
    case 'scissors':
    case 'sixty_nine':
    case 'afterglow':
      return 'lie';
    case 'straddle':
    case 'reverse_straddle':
    case 'lap':
    case 'facesit':
      return 'sit';
    case 'kneeling':
    case 'oral':
      return 'kneel';
    case 'bent':
      return 'lean';
    case 'standing':
    case 'wall':
    case 'lift':
    case 'undress':
    case 'solo':
    case 'generic':
    default:
      return 'stand';
  }
}

/**
 * Map Day Sport / athletic beat copy to a dedicated solo mid-action wireframe.
 * Checked before everyday social layouts so "martial arts" does not become duo fight
 * and "golf swing" does not fall through to a standing Keep pin-up.
 */
export function parseSportLayout(text: string | null | undefined): SocialLayout | null {
  const haystack = text?.trim() || '';
  if (!haystack) {
    return null;
  }

  if (/\b(downward\s+dog|down[- ]dog)\b/i.test(haystack)) {
    return 'sport_yoga_dog';
  }
  if (
    /\b(crow\s+pose|side\s+plank|forward\s+fold|warrior\s+(?:two|2|ii)|tree\s+pose|yoga\s+athletic|pilates)\b/i.test(
      haystack
    )
  ) {
    return 'sport_yoga_warrior';
  }
  if (
    /\b(handstand|tumbling\s+pass|split\s+leap|floor\s+exercise|cartwheel|roundoff|giant\s+on|dismount|gymnastics\s+athletic)\b/i.test(
      haystack
    )
  ) {
    return 'sport_handstand';
  }
  if (/\b(dunk(?:ing)?|two-handed\s+through\s+the\s+rim)\b/i.test(haystack)) {
    return 'sport_dunk';
  }
  if (
    /\b(spik(?:e|ing)|jump[- ]serv(?:e|ing)|jump[- ]set(?:ting)?|digging\s+a\s+hard|blocking\s+at\s+the\s+net|volleyball\s+athletic)\b/i.test(
      haystack
    )
  ) {
    return 'sport_spike';
  }
  if (
    /\b(freestyle\s+stroke|flip\s+turn|starting\s+block|butterfly\s+stroke|backstroke|streamline|swim(?:ming)?\s+athletic|lap\s+swim)\b/i.test(
      haystack
    )
  ) {
    return 'sport_swim';
  }
  if (
    /\b(jab(?:bing)?|uppercut|heavy\s+bag|shadowbox|boxing\s+stance|boxing\s+athletic|rear\s+hook|slip(?:ping)?\s+a\s+punch)\b/i.test(
      haystack
    )
  ) {
    return 'sport_box';
  }
  if (
    /\b(popping\s+up|carving\s+down|paddling\s+out|bottom\s+turn|surf(?:ing)?\s+athletic|drop(?:ping)?\s+in|cut(?:ting)?\s+back)\b/i.test(
      haystack
    )
  ) {
    return 'sport_surf';
  }
  if (
    /\b(jump\s+shot|step-back\s+jumper|elevating\s+into\s+a\s+jump|driving\s+hard\s+to\s+the\s+rim|contested\s+rebound|basketball\s+athletic)\b/i.test(
      haystack
    )
  ) {
    return 'sport_jump_shot';
  }
  if (
    /\b(smashing\s+an\s+overhead|overhead\s+with\s+racket|racket\s+high\s+and\s+torso)\b/i.test(
      haystack
    )
  ) {
    return 'sport_overhead';
  }
  if (
    /\b(tossing\s+into\s+a\s+serve|tennis\s+serve|upward\s+extension|serve\s+with\s+knee)\b/i.test(
      haystack
    )
  ) {
    return 'sport_serve';
  }
  if (
    /\b(forehand|backhand|racket\s+head|volley\s+at\s+the\s+net|tennis\s+athletic)\b/i.test(
      haystack
    )
  ) {
    return 'sport_forehand';
  }
  if (
    /\b(foil|fencing|en\s+garde|parry(?:ing)?|riposte|flech|balestra|piste|fencing\s+athletic)\b/i.test(
      haystack
    )
  ) {
    return 'sport_lunge';
  }
  if (
    /\b(roundhouse|martial\s+arts|blocking\s+a\s+strike|forearm\s+chambered|controlled\s+throw\s+on\s+the\s+tatami|front\s+kick|reverse\s+punch|spinning\s+sweep)\b/i.test(
      haystack
    )
  ) {
    return /\b(block(?:ing)?|chambered|parry)\b/i.test(haystack) ? 'sport_block' : 'sport_kick';
  }
  if (/\b(sliding\s+into|slide\s+tackle|sliding\s+into\s+base|dirt\s+kicking)\b/i.test(haystack)) {
    return 'sport_slide';
  }
  if (
    /\b(striking\s+the\s+ball|soccer\s+athletic|dribbling\s+at\s+pace|header|planted\s+foot|volleying|rugby\s+athletic|fending\s+with|try\s+line|lineout)\b/i.test(
      haystack
    )
  ) {
    return /\b(dribbling|fending|try\s+line|tucked|lineout)\b/i.test(haystack)
      ? 'sport_sprint'
      : 'sport_kick';
  }
  if (
    /\b(javelin|discus|shot\s+put|hurling|high\s+jump|fosbury|pole\s+vault|field\s+event|track\s+and\s+field\s+athletic)\b/i.test(
      haystack
    )
  ) {
    return /\b(high\s+jump|fosbury|pole\s+vault)\b/i.test(haystack)
      ? 'sport_hurdle'
      : 'sport_throw';
  }
  if (/\b(delivering\s+a\s+pitch|windup|leg\s+kick\s+high|pitch\s+from\s+the)\b/i.test(haystack)) {
    return 'sport_pitch';
  }
  if (/\b(rolling\s+a\s+putt|putting\s+green|quiet\s+shoulders)\b/i.test(haystack)) {
    return 'sport_putt';
  }
  if (
    /\b(driver\s+swing|golf\s+athletic|unloading\s+into\s+a\s+swing|baseball\s+swing|bunker\s+shot|iron\s+approach|addressing\s+a\s+tee)\b/i.test(
      haystack
    )
  ) {
    return 'sport_swing';
  }
  if (
    /\b(wrist\s+shot|stickhandling|hockey\s+athletic|back\s+skate|butterfly\s+save|slap\s+shot|hard\s+stop)\b/i.test(
      haystack
    )
  ) {
    return 'sport_stick';
  }
  if (
    /\b(slalom|moguls|ski(?:ing)?\s+athletic|carving\s+through|kicker|GS\s+turn|aero\s+race\s+position|ski\s+athletic)\b/i.test(
      haystack
    )
  ) {
    return 'sport_ski';
  }
  if (
    /\b(out\s+of\s+the\s+saddle|aero\s+tuck|pedal(?:ing|s)?|road\s+bike|racing\s+bicycle|cycling\s+athletic|bike\s+leg|criterium|power\s+climb)\b/i.test(
      haystack
    )
  ) {
    return 'sport_cycle';
  }
  if (
    /\b(dyno(?:ing)?|heel\s+hook(?:ing)?|crimp|climbing\s+athletic|overhang|boulder|campus\s+board|mantling)\b/i.test(
      haystack
    )
  ) {
    return 'climb';
  }
  if (/\b(clearing\s+a\s+hurdle|hurdle\s+with\s+lead|long[- ]jump\s+takeoff)\b/i.test(haystack)) {
    return 'sport_hurdle';
  }
  if (
    /\b(starting\s+blocks|mid[- ]sprint|high\s+knee|pumping\s+arms|running\s+athletic|triathlon\s+athletic|exploding\s+out\s+of|leaning\s+through\s+a\s+curve)\b/i.test(
      haystack
    ) ||
    (/\bmid[- ]stride\b/i.test(haystack) &&
      /\b(sprint|running|athletic|track|kit|mid-play)\b/i.test(haystack))
  ) {
    return 'sport_sprint';
  }

  // Named sport in Day preset format ("— basketball athletic action") without a pose verb.
  if (/\bbasketball\s+athletic\b/i.test(haystack)) {
    return 'sport_jump_shot';
  }
  if (/\b(?:tennis|golf|baseball)\s+athletic\b/i.test(haystack)) {
    return /\bgolf\b/i.test(haystack) || /\bbaseball\b/i.test(haystack)
      ? 'sport_swing'
      : 'sport_forehand';
  }
  if (/\b(?:soccer|rugby)\s+athletic\b/i.test(haystack)) {
    return 'sport_kick';
  }
  if (/\b(?:hockey)\s+athletic\b/i.test(haystack)) {
    return 'sport_stick';
  }
  if (/\b(?:fencing)\s+athletic\b/i.test(haystack)) {
    return 'sport_lunge';
  }
  if (/\b(?:yoga)\s+athletic\b/i.test(haystack)) {
    return 'sport_yoga_warrior';
  }
  if (/\b(?:cycling|triathlon)\s+athletic\b/i.test(haystack)) {
    return 'sport_cycle';
  }
  if (/\b(?:running|track\s+and\s+field)\s+athletic\b/i.test(haystack)) {
    return 'sport_sprint';
  }
  if (/\b(?:gymnastics)\s+athletic\b/i.test(haystack)) {
    return 'sport_handstand';
  }
  if (/\b(?:climbing)\s+athletic\b/i.test(haystack)) {
    return 'climb';
  }
  if (/\b(?:martial\s+arts)\s+athletic\b/i.test(haystack)) {
    return 'sport_kick';
  }
  if (/\b(?:ski)\s+athletic\b/i.test(haystack)) {
    return 'sport_ski';
  }
  if (/\b(?:swimming)\s+athletic\b/i.test(haystack)) {
    return 'sport_swim';
  }
  if (/\b(?:volleyball)\s+athletic\b/i.test(haystack)) {
    return 'sport_spike';
  }
  if (/\b(?:boxing)\s+athletic\b/i.test(haystack)) {
    return 'sport_box';
  }
  if (/\b(?:surfing)\s+athletic\b/i.test(haystack)) {
    return 'sport_surf';
  }

  return null;
}

/**
 * Map non-intimate scene copy to a dedicated social/action wireframe layout.
 * Intimate layouts win first; these catch sport, hug/dance/fight/climb/phone/look-back.
 */
export function parseSocialLayout(text: string | null | undefined): SocialLayout | null {
  const haystack = text?.trim() || '';
  if (!haystack) {
    return null;
  }
  const sport = parseSportLayout(haystack);
  if (sport) {
    return sport;
  }
  if (
    /\b(hug(?:s|ging|ged)?|embrace(?:s|d|ing)?|hold(?:s|ing)?\s+(?:them|her|him|each other)\s+close|wrapped\s+(?:in\s+)?(?:arms?|an embrace)|bear[- ]hug|arm[-\s]?in[-\s]?arm|arm\s+around\s+(?:a|her|his|their|the)|link(?:s|ing)?\s+arms)\b/i.test(
      haystack
    )
  ) {
    return 'hug';
  }
  if (
    /\b(danc(?:e|es|ing)|waltz(?:es|ing)?|twirl(?:s|ing)?|spin(?:s|ning)?\s+(?:together|with)|slow\s+dance)\b/i.test(
      haystack
    ) ||
    (/\bballroom\b/i.test(haystack) &&
      !/\b(chaise|clit|sex|fuck|nude|naked|suspend|lower(?:s|ing)|alcove)\b/i.test(haystack))
  ) {
    return 'dance';
  }
  if (
    /\b(fight(?:s|ing)?|punch(?:es|ing)?|strike(?:s|ing)?|spar(?:s|ring)?|duel(?:s|ing)?|brawl(?:s|ing)?|scuffle|swing(?:s|ing)?\s+(?:a\s+)?(?:fist|punch)|combat|martial)\b/i.test(
      haystack
    )
  ) {
    return 'fight';
  }
  // Stairs read as a walking climb, not a hand-over-hand ladder climb.
  if (
    /\b(climb(?:s|ing)?\s+(?:the\s+)?(?:stairs|steps|staircase)|up\s+the\s+(?:stairs|steps)|taking\s+the\s+(?:stairs|steps)|descend(?:s|ing)?\s+the\s+(?:stairs|steps)|down\s+the\s+(?:stairs|steps))\b/i.test(
      haystack
    )
  ) {
    return 'stairs';
  }
  if (
    /\b(climb(?:s|ing|ed)?|clamber(?:s|ing)?|scale(?:s|ing)?|scrambl(?:e|es|ing)\s+up|up\s+the\s+(?:ladder|rope|wall|cliff|drainpipe)|hand[- ]over[- ]hand)\b/i.test(
      haystack
    )
  ) {
    return 'climb';
  }
  if (
    /\b((?:on\s+(?:the|their|her|his)\s+)?phone|text(?:s|ing)?|selfie|scroll(?:s|ing)?\s+(?:on\s+)?(?:a\s+)?phone|looking\s+at\s+(?:a\s+)?(?:phone|screen)|checks?\s+(?:a\s+)?phone|mobile\s+in\s+hand)\b/i.test(
      haystack
    )
  ) {
    return 'phone';
  }
  // Everyday stances — specific body shapes that would otherwise fall through to a plain stand.
  if (
    /\b(foot\s+(?:up\s+)?(?:propped\s+)?on\s+(?:the\s+|a\s+)?(?:step|stair|ledge|bench|curb|kerb|rail|box)|propp(?:ed|ing)\s+(?:one\s+)?foot|boot\s+up\s+on)\b/i.test(
      haystack
    )
  ) {
    return 'foot_up';
  }
  if (
    /\b(bend(?:s|ing)?\s+(?:down|over|to\s+pick)|pick(?:s|ing)?\s+up\s+|scoop(?:s|ing)?\s+up|reach(?:es|ing)?\s+down\s+for|stoop(?:s|ing)?)\b/i.test(
      haystack
    )
  ) {
    return 'bend_pick';
  }
  if (
    /\b(lean(?:s|ing)?\s+(?:back\s+)?(?:against|on)\s+(?:the\s+|a\s+)?(?:\w+\s+)?(?:wall|door|doorway|door\s*frame|jamb|column|post|pillar|counter)|shoulder\s+(?:against|on)\s+the\s+(?:wall|frame|jamb))\b/i.test(
      haystack
    )
  ) {
    return 'lean_wall';
  }
  if (
    /\b(tuck(?:s|ing)?\s+(?:her\s+)?hair|hand\s+through\s+(?:her\s+)?hair|push(?:es|ing)?\s+hair\s+(?:back|behind)|adjust(?:s|ing)?\s+(?:a\s+|her\s+|the\s+)?(?:\w+\s+)?(?:collar|scarf|strap|sleeve|cuff|earring)|fixes?\s+(?:her\s+)?(?:hair|collar|scarf))\b/i.test(
      haystack
    )
  ) {
    return 'hair_touch';
  }
  if (
    /\b(shrug(?:s|ging)?|palms?\s+up|hands?\s+out\s+(?:in\s+)?(?:a\s+)?shrug)\b/i.test(haystack)
  ) {
    return 'shrug';
  }
  if (
    /\b(hands?\s+on\s+(?:her\s+)?hips?|akimbo|one\s+hand\s+on\s+(?:a\s+|her\s+)?hip)\b/i.test(
      haystack
    )
  ) {
    return 'hands_hips';
  }
  if (
    /\b(look(?:s|ing)?\s+(?:back|over\s+(?:an?\s+|the\s+)?shoulder)|over\s+(?:an?\s+|the\s+)?shoulder|glance(?:s|ing)?\s+back|turns?\s+(?:to\s+)?look\s+back|half[- ]turned|twist(?:ing|s)?\s+to\s+zip|zip(?:ping|s|ped)?\s+(?:up\s+)?(?:a\s+)?dress|unzip(?:ping|s|ped)?|back\s+arch(?:ed)?)\b/i.test(
      haystack
    )
  ) {
    return 'look_back';
  }
  if (
    /\b(stretch(?:es|ing)?|arms?\s+overhead|overhead\s+stretch|mid[- ]yawn|yawn(?:s|ing)?)\b/i.test(
      haystack
    )
  ) {
    return 'stretch';
  }
  if (
    /\b(wave(?:s|ing)?|waving|raises?\s+(?:a\s+)?hand|hello\s+wave|hand\s+raised\s+(?:in\s+)?(?:a\s+)?greeting)\b/i.test(
      haystack
    )
  ) {
    return 'wave';
  }
  if (/\b(arms?\s+crossed|cross(?:ed)?\s+arms?|folded\s+arms)\b/i.test(haystack)) {
    return 'cross_arms';
  }
  if (/\b(hands?\s+in\s+(?:the\s+)?pockets?|both\s+hands\s+in\s+pockets)\b/i.test(haystack)) {
    return 'pockets';
  }
  if (
    /\b(sip(?:s|ping)?|drink(?:s|ing)?\s+(?:coffee|tea|from)|coffee\s+in\s+(?:one\s+)?hand|mug\s+in\s+hand|holding\s+(?:a\s+)?(?:cup|mug|glass)|glass\s+at\s+(?:a\s+)?bar|pour(?:s|ing)?\s+coffee)\b/i.test(
      haystack
    )
  ) {
    return 'drink';
  }
  if (
    /\b(carry(?:ing|ies)?\s+(?:a\s+)?(?:bag|tote|backpack|grocer)|bag\s+over\s+(?:one\s+)?shoulder|tote\s+on\s+(?:one\s+)?arm|backpack\s+strap|holding\s+a\s+(?:shopping\s+)?bag)\b/i.test(
      haystack
    )
  ) {
    return 'carry';
  }
  if (
    /\b(read(?:s|ing)?\s+(?:a\s+)?(?:book|page|paper|menu)|book\s+in\s+hand|browsing\s+a\s+(?:book|shelf)|newspaper\s+open|looking\s+down\s+at\s+(?:a\s+)?(?:book|page|paper|menu))\b/i.test(
      haystack
    )
  ) {
    return 'read';
  }
  if (
    /\b(hands?\s+on\s+(?:the\s+)?rail|leaning\s+on\s+(?:a\s+)?(?:rail|railing|balustrade)|balcony\s+rail|rail(?:ing)?\s+watch|standing\s+at\s+a\s+rail)\b/i.test(
      haystack
    )
  ) {
    return 'rail';
  }
  if (
    /\b(point(?:s|ing)?\s+(?:at|toward|towards|out|ahead)|points?\s+out|gestur(?:e|es|ing)\s+(?:toward|towards|ahead))\b/i.test(
      haystack
    )
  ) {
    return 'point';
  }
  return null;
}

/**
 * Posture stated in the scene text, which must win the mannequin's base over a hand-gesture
 * layout: "lying across the bed scrolling a phone" is a lying figure holding a phone, not a
 * standing one. The gesture still sets the arms.
 */
function posturalBaseFromScene(haystack: string): PoseGuideBase | null {
  if (
    /\b(lie|lying|sprawl(?:ed|ing)?|reclin(?:e|es|ed|ing)|flat\s+on\s+(?:the|her|his)\s+(?:bed|floor|back))\b/i.test(
      haystack
    )
  ) {
    return 'lie';
  }
  if (/\b(kneel(?:s|ing)?|on\s+(?:one\s+)?knee)\b/i.test(haystack)) {
    return 'kneel';
  }
  if (
    /\b(crouch(?:es|ing)?|squat(?:s|ting)?|hunker(?:ed|ing)?|stoop(?:s|ing)?)\b/i.test(haystack)
  ) {
    return 'crouch';
  }
  if (
    /\b(sit(?:s|ting)?|seated|curled|cross-legged|perch(?:ed|ing)?|booth|on\s+(?:a|the)\s+(?:bench|stool|curb|step|stairs)|in\s+(?:a|the)\s+(?:booth|armchair))\b/i.test(
      haystack
    )
  ) {
    return 'sit';
  }
  // Gait counts too: "mid-stride on the sidewalk, coffee in one hand" is a walking figure
  // holding a cup, not someone standing still. Checked last so a seat or a recline wins.
  if (/\b(mid[- ]stride|walk(?:s|ing)?|strid(?:e|es|ing)|heading\s+out|pacing)\b/i.test(haystack)) {
    return 'walk';
  }
  return null;
}

function socialBaseForLayout(layout: SocialLayout): PoseGuideBase {
  switch (layout) {
    case 'climb':
    case 'stretch':
    case 'sport_jump_shot':
    case 'sport_dunk':
    case 'sport_serve':
    case 'sport_throw':
    case 'sport_overhead':
    case 'sport_spike':
      return 'reach';
    case 'sport_sprint':
    case 'sport_kick':
    case 'sport_lunge':
    case 'sport_hurdle':
    case 'sport_box':
      return 'run';
    case 'sport_cycle':
    case 'sport_yoga_dog':
    case 'sport_putt':
    case 'sport_slide':
    case 'sport_surf':
    case 'sport_swim':
      return 'crouch';
    case 'sport_handstand':
      return 'jump';
    case 'fight':
    case 'dance':
    case 'carry':
    case 'sport_forehand':
    case 'sport_swing':
    case 'sport_stick':
    case 'sport_pitch':
    case 'sport_block':
    case 'sport_yoga_warrior':
    case 'sport_ski':
      return 'walk';
    case 'rail':
    case 'lean_wall':
    case 'foot_up':
      return 'lean';
    case 'bend_pick':
      return 'crouch';
    case 'stairs':
      return 'walk';
    case 'hug':
    case 'phone':
    case 'look_back':
    case 'wave':
    case 'cross_arms':
    case 'pockets':
    case 'drink':
    case 'point':
    case 'read':
    case 'hands_hips':
    case 'hair_touch':
    case 'shrug':
    default:
      return 'stand';
  }
}

function point(x: number, y: number): Point {
  return { x: clamp(x, 0.04, 0.96), y: clamp(y, 0.06, 0.94) };
}

function offset(base: Point, dx: number, dy: number): Point {
  return point(base.x + dx, base.y + dy);
}

function armChain(
  shoulder: Point,
  side: -1 | 1,
  style: PoseGuideArm,
  jitter: number
): { elbow: Point; wrist: Point } {
  const jx = jitter * 0.02 * side;
  const jy = jitter * 0.015;
  switch (style) {
    case 'up':
      return {
        elbow: offset(shoulder, side * 0.04 + jx, -0.08 + jy),
        wrist: offset(shoulder, side * 0.06 + jx, -0.18 + jy),
      };
    case 'out':
      return {
        elbow: offset(shoulder, side * 0.12 + jx, 0.08 + jy),
        wrist: offset(shoulder, side * 0.2 + jx, 0.04 + jy),
      };
    case 'forward':
      return {
        elbow: offset(shoulder, side * 0.02 + jx, 0.12 + jy),
        wrist: offset(shoulder, side * -0.02 + jx, 0.22 + jy),
      };
    case 'hold':
      return {
        elbow: offset(shoulder, side * 0.06 + jx, 0.1 + jy),
        wrist: offset(shoulder, side * 0.02 + jx, 0.18 + jy),
      };
    case 'crossed':
      return {
        elbow: offset(shoulder, side * 0.02 + jx, 0.1 + jy),
        wrist: offset(shoulder, side * -0.1 + jx, 0.14 + jy),
      };
    case 'down':
    default:
      return {
        elbow: offset(shoulder, side * 0.05 + jx, 0.12 + jy),
        wrist: offset(shoulder, side * 0.04 + jx, 0.24 + jy),
      };
  }
}

/**
 * Parse scene/beat text into a pose intent, then synthesize joint positions.
 * Same text (+ fallback index) always yields the same skeleton.
 */
export function parsePoseGuideIntent(
  text: string | null | undefined,
  fallbackIndex = 0,
  options?: { forcePeople?: number; clothedUprightOnly?: boolean; allowIntimate?: boolean }
): PoseGuideIntent {
  const haystack = text?.trim() || '';
  const seed = hashString(`${haystack}::${fallbackIndex}`) || 1;
  const jitterA = seededUnit(seed, 1);
  const jitterB = seededUnit(seed, 2);

  let base: PoseGuideBase = (['stand', 'walk', 'sit', 'lean'] as const)[
    Math.abs(fallbackIndex) % 4
  ]!;
  let matched = false;
  let armLeft: PoseGuideArm = 'down';
  let armRight: PoseGuideArm = 'down';
  let lean = (jitterA - 0.5) * 0.2;
  let stride = 0.25 + jitterB * 0.2;
  // Sex layouts belong to the adult moods only. Without this gate an everyday beat like
  // "leaning against a brick wall waiting for a friend" draws a two-figure wall-press.
  const intimateAllowed = !options?.clothedUprightOnly && options?.allowIntimate !== false;
  let intimate = intimateAllowed ? parseIntimateLayout(haystack) : null;
  let social = intimate ? null : parseSocialLayout(haystack);

  // Vacation pose-class leads (MID-STRIDE, SEATED, RELAXING, …) must win over prop/glance
  // socials — otherwise "half-turned" → look_back→stand and "sipping coffee" → drink→stand.
  // ALL-CAPS only: Sport beats like "mid-stride sprint drive — … athletic action" must keep
  // sport_* layouts and must not be stolen by a case-insensitive MID-STRIDE lead.
  const vacationPoseLead = haystack
    .trim()
    .match(
      /^(SEATED|MID-STRIDE|RECLINING|RELAXING|DANCING|CLIMBING|WAVING|PERCHED|STRETCHING|KICKING|PADDLING|PEDALING|TOSSING|JUMPING|REACHING|SWIMMING)\b/
    );
  if (vacationPoseLead && social) {
    const cls = vacationPoseLead[1]!.toUpperCase();
    const keepSocial =
      (cls === 'WAVING' && social === 'wave') ||
      (cls === 'DANCING' && social === 'dance') ||
      (cls === 'CLIMBING' && social === 'climb') ||
      (cls === 'STRETCHING' && social === 'stretch');
    if (
      !keepSocial &&
      (social === 'look_back' ||
        social === 'carry' ||
        social === 'drink' ||
        social === 'phone' ||
        social === 'read' ||
        social === 'wave' ||
        social === 'point' ||
        social === 'pockets' ||
        social === 'cross_arms' ||
        social === 'rail' ||
        social === 'hug')
    ) {
      social = null;
    }
  }

  // Pose-class lead owns base/arms — beat props like "jog" / "after a run" must not steal walk.
  if (vacationPoseLead) {
    const cls = vacationPoseLead[1]!.toUpperCase();
    if (cls === 'CLIMBING') {
      social = 'climb';
    } else if (cls === 'STRETCHING') {
      social = 'stretch';
    } else if (cls === 'DANCING') {
      social = 'dance';
    } else if (cls === 'WAVING') {
      social = 'wave';
    } else if (cls === 'REACHING') {
      social = null;
      base = 'reach';
      armLeft = 'out';
      armRight = 'up';
      lean = jitterA > 0.5 ? 0.28 : -0.28;
      stride = 0.4;
      matched = true;
    } else if (cls === 'JUMPING') {
      social = null;
      base = 'jump';
      armLeft = 'up';
      armRight = 'up';
      stride = 0.5;
      matched = true;
    } else if (cls === 'KICKING') {
      // Dedicated sport_kick wireframe — nuclear walk-kick still collapses to yoga-tree in Qwen.
      social = 'sport_kick';
      base = 'run';
      armLeft = 'out';
      armRight = 'out';
      stride = 0.95;
      lean = 0.28;
      matched = true;
    } else if (cls === 'TOSSING') {
      // Dedicated sport_throw — cocked arm + weight shift beat arms-at-sides freeze.
      social = 'sport_throw';
      base = 'reach';
      armLeft = 'forward';
      armRight = 'up';
      lean = 0.3;
      stride = 0.55;
      matched = true;
    } else if (cls === 'MID-STRIDE') {
      social = null;
      base = 'walk';
      armLeft = 'forward';
      armRight = 'out';
      stride = 0.75;
      lean = (jitterA - 0.5) * 0.25;
      matched = true;
    }
  }

  const forcedPeople =
    options?.forcePeople != null && Number.isFinite(options.forcePeople)
      ? Math.min(3, Math.max(1, Math.round(options.forcePeople)))
      : null;
  // Duo chip / forced pair: never a solo masturbation wireframe; default a readable pair stance.
  // Only when sex layouts are allowed — a friendly "Duo · companions" everyday beat such as
  // "diner booth across from a friend" must not be handed a missionary wireframe.
  if (
    forcedPeople != null &&
    forcedPeople >= 2 &&
    !options?.clothedUprightOnly &&
    intimateAllowed
  ) {
    if (intimate && INTIMATE_SOLO_LAYOUTS.has(intimate)) {
      intimate = 'missionary';
    }
    if (!intimate && !social) {
      intimate = 'missionary';
    }
    social = intimate ? null : social;
  }

  // Vacation / Suggestive: no intimate duo wireframes; kneel/lie flatten to sit.
  // Standing look-back / dance / wave stay — those are upright solo travel energy —
  // unless a vacation pose-class lead already cleared social above.
  if (options?.clothedUprightOnly) {
    intimate = null;
    if (social === 'hug' || social === 'fight') {
      social = null;
      base = 'lean';
      matched = true;
      armLeft = 'down';
      armRight = 'hold';
      lean = jitterA > 0.5 ? 0.28 : -0.28;
      stride = 0.22;
    } else if (social === 'look_back' || social === 'dance' || social === 'wave') {
      matched = true;
      base = socialBaseForLayout(social);
      if (social === 'look_back') {
        stride = 0.28;
        armLeft = 'up';
        armRight = 'hold';
        lean = jitterA > 0.5 ? 0.35 : -0.35;
        if (/\b(zip|unzip|twist(?:ing)?)\b/i.test(haystack)) {
          armLeft = 'up';
          armRight = 'up';
          lean = 0.35;
        }
      } else if (social === 'dance') {
        stride = 0.4;
        armLeft = 'out';
        armRight = 'hold';
        lean = jitterA > 0.5 ? 0.15 : -0.15;
      } else {
        stride = 0.22;
        armLeft = 'down';
        armRight = 'up';
        lean = (jitterA - 0.5) * 0.15;
      }
    }
  }

  // Intimate beats win over generic sit/lie/stand so sex scenes get dedicated layouts.
  if (intimate) {
    base = intimateBaseForLayout(intimate);
    matched = true;
    stride = intimate === 'standing' || intimate === 'bent' ? 0.35 : 0.45;
    armLeft = intimate === 'standing' || intimate === 'bent' ? 'hold' : 'forward';
    armRight = 'hold';
    lean = (jitterA - 0.5) * 0.15;
  } else if (social) {
    base = socialBaseForLayout(social);
    matched = true;
    if (social === 'hug') {
      stride = 0.2;
      armLeft = 'hold';
      armRight = 'hold';
      lean = (jitterA - 0.5) * 0.1;
    } else if (social === 'dance') {
      stride = 0.45;
      armLeft = 'out';
      armRight = 'hold';
      lean = jitterA > 0.5 ? 0.2 : -0.2;
    } else if (social === 'fight') {
      stride = 0.55;
      armLeft = 'forward';
      armRight = 'out';
      lean = (jitterA - 0.5) * 0.35;
    } else if (social === 'climb') {
      stride = 0.4;
      armLeft = 'up';
      armRight = 'up';
      lean = 0.1;
    } else if (social === 'phone') {
      stride = 0.22;
      armLeft = 'down';
      armRight = 'forward';
      lean = -0.08;
    } else if (social === 'look_back') {
      stride = 0.28;
      armLeft = 'up';
      armRight = 'hold';
      lean = jitterA > 0.5 ? 0.35 : -0.35;
      if (/\b(zip|unzip|twist(?:ing)?)\b/i.test(haystack)) {
        armLeft = 'up';
        armRight = 'up';
        lean = 0.35;
      }
    } else if (social === 'stretch') {
      stride = 0.35;
      armLeft = 'up';
      armRight = 'up';
      lean = (jitterA - 0.5) * 0.12;
    } else if (social === 'hands_hips') {
      stride = 0.3;
      armLeft = 'hold';
      armRight = 'hold';
      lean = (jitterA - 0.5) * 0.25;
    } else if (social === 'bend_pick') {
      stride = 0.32;
      armLeft = 'forward';
      armRight = 'down';
      lean = 0.3;
    } else if (social === 'foot_up') {
      stride = 0.5;
      armLeft = 'forward';
      armRight = 'hold';
      lean = 0.22;
    } else if (social === 'lean_wall') {
      stride = 0.22;
      armLeft = 'hold';
      armRight = 'down';
      lean = jitterA > 0.5 ? 0.3 : -0.3;
    } else if (social === 'hair_touch') {
      stride = 0.24;
      armLeft = 'up';
      armRight = 'down';
      lean = (jitterA - 0.5) * 0.2;
    } else if (social === 'shrug') {
      stride = 0.3;
      armLeft = 'out';
      armRight = 'out';
      lean = (jitterA - 0.5) * 0.12;
    } else if (social === 'stairs') {
      stride = 0.6;
      armLeft = 'forward';
      armRight = 'down';
      lean = 0.18;
    }
    // A stated posture outranks a stand-based gesture layout: keep the arms, fix the body.
    if (base === 'stand') {
      const posture = posturalBaseFromScene(haystack);
      if (posture) {
        base = posture;
        if (posture === 'sit' || posture === 'lie') {
          stride = Math.min(stride, 0.4);
        }
      }
    }
  } else if (matched) {
    // Vacation pose-class lead already forced base/arms — skip keyword overrides
    // (e.g. REACHING … "jog" must not become walk).
  } else if (
    /\b(lie|lying|sprawl(?:ed|ing|s)?|prone|on\s+the\s+(?:floor|ground|bed))\b/i.test(haystack)
  ) {
    base = 'lie';
    stride = 0.55;
    matched = true;
  } else if (
    // RECLINING lead is always a lounge lie — "upright on elbows" still means on the surface.
    /^RECLINING\b/i.test(haystack.trim()) ||
    (!/\b(upright\s+against|headboard|wine-?bar\s+counter|chin\s+on\s+hand)\b/i.test(haystack) &&
      ((/^(RELAXING)\b/i.test(haystack.trim()) &&
        /\b(towel|lounge|daybed|hammock|float|chaise|cabana|knees?\s+drawn|sunbath|sofa|couch)\b/i.test(
          haystack
        )) ||
        /\b(relax(?:es|ed|ing)?|reclin(?:e|es|ed|ing)?)\b[\s\S]{0,80}\b(towel|lounge|daybed|hammock|float|chaise|cabana|sofa|couch)\b/i.test(
          haystack
        ) ||
        /\b(on\s+a\s+(?:beach\s+)?towel|sunbathing|knees?\s+drawn\s+up)\b/i.test(haystack)))
  ) {
    // Beach-towel / lounge relax must be horizontal — sit silhouettes still read as stand to Edit.
    base = 'lie';
    stride = 0.6;
    armLeft = 'hold';
    armRight = 'hold';
    matched = true;
  } else if (/\b(jump(?:ing|s)?|leap(?:ing|s)?|vault(?:ing)?)\b/i.test(haystack)) {
    base = 'jump';
    stride = 0.45;
    armLeft = 'out';
    armRight = 'out';
    matched = true;
  } else if (/\b(kneel(?:ing)?|on\s+(?:one\s+)?knee|propose|proposal)\b/i.test(haystack)) {
    base = 'kneel';
    stride = 0.35;
    matched = true;
  } else if (/\b(crouch(?:ing|es)?|squat(?:ting)?|duck(?:ing)?|hunker)\b/i.test(haystack)) {
    base = 'crouch';
    stride = 0.4;
    matched = true;
  } else if (
    /\b(sit(?:ting|s)?|seated|couch|sofa|chair|bench|perch(?:ed|ing)?|lounge(?:s|ing)?|cross-legged|reclin(?:e|es|ed|ing)?|relax(?:es|ed|ing)?|on\s+a\s+(?:towel|lounge|stool|hammock|float|chaise|ledge|piling|saddle|gate|daybed)|in\s+a\s+(?:convertible|hammock|cabana|tub))\b/i.test(
      haystack
    )
  ) {
    base = 'sit';
    stride = 0.35;
    armLeft = 'hold';
    armRight = 'hold';
    matched = true;
  } else if (
    /\b(swim(?:s|ming)?|freestyle|backstroke|breaststroke|mid[- ]stroke|treading\s+water|swimming\s+a\s+lap)\b/i.test(
      haystack
    )
  ) {
    // Horizontal in the water — the vacation SWIMMING directive says "never dry standing on deck",
    // but without a layout the stance used to come from the slot index.
    base = 'lie';
    stride = 0.6;
    armLeft = 'up';
    armRight = 'forward';
    matched = true;
  } else if (/\b(kick(?:s|ing)?|kicking\s+through)\b/i.test(haystack)) {
    base = 'walk';
    stride = 0.7;
    armLeft = 'out';
    armRight = 'out';
    matched = true;
  } else if (/\b(paddl(?:e|es|ing)|kayak)\b/i.test(haystack)) {
    base = 'sit';
    stride = 0.4;
    armLeft = 'forward';
    armRight = 'forward';
    matched = true;
  } else if (/\b(pedal(?:s|ing)?|bik(?:e|ing)|cycling)\b/i.test(haystack)) {
    base = 'sit';
    stride = 0.55;
    armLeft = 'forward';
    armRight = 'forward';
    matched = true;
  } else if (/\b(toss(?:es|ing)?|throw(?:s|ing)?|frisbee|beach\s+ball)\b/i.test(haystack)) {
    base = 'reach';
    stride = 0.45;
    armRight = 'up';
    armLeft = 'out';
    matched = true;
  } else if (
    /\b(run(?:ning|s)?|sprint(?:ing|s)?|dash(?:ing|es)?|flee(?:ing|s)?|chase(?:s|ing)?)\b/i.test(
      haystack
    )
  ) {
    base = 'run';
    stride = 0.85;
    armLeft = 'forward';
    armRight = 'forward';
    matched = true;
  } else if (
    /\b(walk(?:ing|s|ed)?|mid-?stride|stride(?:s|ing)?|jog(?:ging|s)?|stroll(?:ing|s)?|pace(?:s|ing)?|tiptoe(?:ing)?|hurry(?:ing)?|rush(?:ing|es)?)\b/i.test(
      haystack
    )
  ) {
    base = 'walk';
    // Wide stride + opposite arm swing so Image 3 cannot read as a planted stand.
    stride = 0.72 + jitterA * 0.2;
    armLeft = 'forward';
    armRight = 'out';
    lean = (jitterA - 0.5) * 0.25;
    matched = true;
  } else if (
    !/\b(masturbat|fingering|finger(?:s|ed)?\s+(?:herself|himself|themselves|in|inside|on)|between\s+her\s+thighs|vulva|clit)\b/i.test(
      haystack
    ) &&
    /\b(reach(?:ing|es|ed)?|grab(?:bing|s|bed)?|pour(?:ing|s|ed)?|wave(?:s|ing|d)?|point(?:ing|s|ed)?|gesture(?:s|ing)?|raise(?:s|d|ing)?|arms?\s+(?:up|out|raised)|lift(?:ing|s|ed)?|toss(?:ing|es)?|throw(?:ing|s)?|offer(?:ing|s)?)\b/i.test(
      haystack
    )
  ) {
    base = 'reach';
    stride = 0.3;
    armRight = 'up';
    armLeft = 'out';
    matched = true;
  } else if (/\b(lean(?:ing|s)?|against|doorway|window|slouch(?:ing)?)\b/i.test(haystack)) {
    base = 'lean';
    lean = jitterA > 0.5 ? 0.35 : -0.35;
    stride = 0.25;
    matched = true;
  } else if (
    /\b(stand(?:ing|s)?|pause(?:s|d|ing)?|wait(?:ing|s)?|watch(?:ing|es)?|pocket(?:s)?|stillness|planted|weight\s+on\s+one\s+leg)\b/i.test(
      haystack
    )
  ) {
    base = 'stand';
    stride = 0.2 + jitterB * 0.15;
    matched = true;
  }

  // No verb cue — keep seeded fallback base (stand/walk/sit/lean by index).
  if (!matched && !haystack) {
    base = (['stand', 'walk', 'sit', 'lean'] as const)[Math.abs(fallbackIndex) % 4]!;
  }

  if (/\b(arms?\s+crossed|cross(?:ed)?\s+arms?)\b/i.test(haystack)) {
    armLeft = 'crossed';
    armRight = 'crossed';
  } else if (/\b(hands?\s+in\s+pockets?|pockets?)\b/i.test(haystack) && base === 'stand') {
    armLeft = 'hold';
    armRight = 'hold';
  } else if (/\b(wave(?:s|ing|d)?)\b/i.test(haystack) && !social) {
    armRight = 'up';
  } else if (/\b(point(?:ing|s|ed)?)\b/i.test(haystack) && !social) {
    armRight = 'forward';
  } else if (/\b(hold(?:ing|s)?|carry(?:ing|ies)?|clutch(?:ing)?)\b/i.test(haystack) && !social) {
    armLeft = 'hold';
    armRight = armRight === 'down' ? 'hold' : armRight;
  }

  if (/\b(left)\b/i.test(haystack) && lean === 0) {
    lean = -0.25;
  } else if (/\b(right)\b/i.test(haystack) && Math.abs(lean) < 0.05) {
    lean = 0.25;
  }

  // Clothed Day moods: flatten kneel/crouch into sit after verb matching.
  // Keep standing look-back / wave / dance — only floor kneel was the doggy prior.
  // Keep lie for RELAXING/RECLINING towel-lounge (horizontal, not all-fours).
  if (options?.clothedUprightOnly) {
    intimate = null;
    if (base === 'kneel' || base === 'crouch') {
      base = 'sit';
      stride = 0.35;
      armLeft = 'hold';
      armRight = 'hold';
      lean = clamp(lean, -0.2, 0.2);
      matched = true;
    } else if (base === 'lie') {
      const keepLounge =
        /^(RELAXING|RECLINING|SWIMMING)\b/i.test(haystack.trim()) ||
        /\b(relax(?:es|ed|ing)?|reclin(?:e|es|ed|ing)?|towel|lounge|hammock|daybed|float|chaise|sunbath|sofa|couch|swim(?:s|ming)?|freestyle|backstroke|mid[- ]stroke|treading\s+water)\b/i.test(
          haystack
        );
      if (!keepLounge) {
        base = 'sit';
        stride = 0.35;
        armLeft = 'hold';
        armRight = 'hold';
        lean = clamp(lean, -0.2, 0.2);
        matched = true;
      }
    }
  }

  let people = countPoseGuidePeople(haystack);
  if (options?.clothedUprightOnly) {
    people = forcedPeople != null && forcedPeople >= 2 ? forcedPeople : 1;
  } else if (intimate && INTIMATE_SOLO_LAYOUTS.has(intimate)) {
    people = 1;
  } else if (intimate && people < 2) {
    if (intimate === 'generic' && /\b(solo|alone|masturbat)\b/i.test(haystack)) {
      people = 1;
    } else if (intimate === 'undress' && /\b(solo|alone)\b/i.test(haystack)) {
      people = 1;
    } else {
      people = 2;
    }
  }
  if (
    !options?.clothedUprightOnly &&
    intimate &&
    !INTIMATE_SOLO_LAYOUTS.has(intimate) &&
    /\b(threesome|three[- ]way|mmf|ffm|spit[- ]?roast)\b/i.test(haystack)
  ) {
    people = 3;
  }
  if (!options?.clothedUprightOnly) {
    if (social && SOCIAL_SOLO_LAYOUTS.has(social)) {
      // Solo action layouts stay solo unless the copy clearly names a duo/crowd.
      if (people < 2) {
        people = 1;
      }
    } else if (social && people < 2) {
      people = 2;
    }
  }
  // Caller force wins last (Day Intimate Duo chip → always two Image 3 figures).
  if (forcedPeople != null) {
    people = forcedPeople;
  }

  return {
    base,
    armLeft,
    armRight,
    lean: clamp(lean, -0.45, 0.45),
    stride: clamp(stride, 0.15, 0.95),
    seed,
    people,
    intimate,
    social,
    sceneText: haystack || undefined,
    label: intimate
      ? `${intimate}-${seed.toString(16).slice(0, 6)}`
      : social
        ? `${social}-${seed.toString(16).slice(0, 6)}`
        : `${base}-${armLeft}-${armRight}-${seed.toString(16).slice(0, 6)}`,
  };
}

/** Build a unique stick skeleton from pose intent (procedural, not a canned slot). */
export function synthesizeStickSkeleton(
  intent: PoseGuideIntent,
  options?: { centerX?: number; seedSalt?: number }
): StickSkeleton {
  const seedSalt = options?.seedSalt ?? 0;
  const seed = (intent.seed + seedSalt * 0x85ebca6b) >>> 0;
  const j = (salt: number) => (seededUnit(seed, salt) - 0.5) * 0.04;
  const lean = intent.lean;
  const stride = intent.stride;
  const centerX = options?.centerX ?? 0.5;

  let pelvisY = 0.48;
  let headY = 0.12;
  let torsoScale = 1;
  const scene = intent.sceneText ?? '';
  const reclinedSit =
    intent.base === 'sit' &&
    /\b(relax(?:es|ed|ing)?|reclin(?:e|es|ed|ing)?|lounge(?:s|ing)?|hammock|daybed|towel|float|chaise)\b/i.test(
      scene
    );
  const perchedSit =
    intent.base === 'sit' && /\b(perch(?:ed|ing)?|piling|ledge|stool|wall|gate)\b/i.test(scene);
  const chairSit =
    intent.base === 'sit' &&
    (/^(SEATED|PERCHED)\b/i.test(scene.trim()) ||
      /\b(sit(?:ting|s)?|seated|chair|bench|stool|saddle|steps|carpet|vanity|table)\b/i.test(
        scene
      ));
  if (intent.base === 'sit' && (chairSit || perchedSit) && !reclinedSit) {
    // Deep chair sit — Keep try-ons are standing; Image 3 must read as hips-on-seat, not a short stand.
    const ox = centerX - 0.5;
    const oneKneeUp = /\b(one\s+knee|knee\s+up|cross(?:ed)?-?legged|legs?\s+cross)\b/i.test(scene);
    return {
      head: point(0.5 + ox + lean * 0.04 + j(1), 0.3 + j(2)),
      neck: point(0.5 + ox + j(3), 0.38 + j(4)),
      pelvis: point(0.5 + ox - lean * 0.02 + j(5), 0.72 + j(6)),
      lShoulder: point(0.38 + ox + j(7), 0.4 + j(8)),
      rShoulder: point(0.62 + ox + j(9), 0.39 + j(10)),
      lElbow: point(0.34 + ox + j(11), 0.52 + j(12)),
      rElbow: point(0.66 + ox + j(13), 0.5 + j(14)),
      lWrist: point(0.4 + ox + j(15), 0.62 + j(16)),
      rWrist: point(0.6 + ox + j(17), 0.6 + j(18)),
      lHip: point(0.44 + ox + j(19), 0.72 + j(20)),
      rHip: point(0.56 + ox + j(21), 0.72 + j(22)),
      lKnee: point(0.42 + ox + j(23), oneKneeUp ? 0.58 : 0.72 + j(24)),
      rKnee: point(0.68 + ox + j(25), 0.7 + j(26)),
      lAnkle: point(0.4 + ox + j(27), oneKneeUp ? 0.7 : 0.92 + j(28)),
      rAnkle: point(0.74 + ox + j(29), 0.9 + j(30)),
    };
  }
  if (intent.base === 'sit') {
    // Exaggerate seated silhouette — Keep try-ons are standing; Image 3 must read as sit.
    pelvisY = reclinedSit ? 0.68 : perchedSit ? 0.62 : 0.64;
    headY = reclinedSit ? 0.3 : 0.26;
    torsoScale = reclinedSit ? 0.85 : 0.9;
  } else if (intent.base === 'crouch') {
    pelvisY = 0.55;
    headY = 0.2;
    torsoScale = 0.88;
  } else if (intent.base === 'kneel') {
    pelvisY = 0.56;
    headY = 0.18;
  } else if (intent.base === 'lie') {
    const ox = centerX - 0.5;
    const lounge =
      /^(RELAXING|RECLINING)\b/i.test(scene.trim()) ||
      /\b(relax(?:es|ed|ing)?|reclin(?:e|es|ed|ing)?|towel|lounge|hammock|daybed|float|chaise|knees?\s+drawn|sunbath|sofa|couch)\b/i.test(
        scene
      );
    if (lounge) {
      // Side-view supine — long horizontal body, knees drawn toward chest. Edit must not
      // read this as an upright stand (head≈pelvis Y with short limb span failed before).
      return {
        head: point(0.14 + ox + j(1), 0.58 + j(2)),
        neck: point(0.22 + ox + j(3), 0.56 + j(4)),
        pelvis: point(0.52 + ox + j(5), 0.6 + j(6)),
        lShoulder: point(0.24 + ox + j(7), 0.5 + j(8)),
        rShoulder: point(0.26 + ox + j(9), 0.62 + j(10)),
        lElbow: point(0.34 + ox + j(11), 0.44 + j(12)),
        rElbow: point(0.36 + ox + j(13), 0.66 + j(14)),
        lWrist: point(0.42 + ox + j(15), 0.4 + j(16)),
        rWrist: point(0.44 + ox + j(17), 0.68 + j(18)),
        lHip: point(0.5 + ox + j(19), 0.56 + j(20)),
        rHip: point(0.54 + ox + j(21), 0.62 + j(22)),
        lKnee: point(0.64 + ox + j(23), 0.34 + j(24)),
        rKnee: point(0.7 + ox + j(25), 0.38 + j(26)),
        lAnkle: point(0.58 + ox + j(27), 0.22 + j(28)),
        rAnkle: point(0.64 + ox + j(29), 0.24 + j(30)),
      };
    }
    // Horizontal-ish figure — still readable as a wireframe cue.
    return {
      head: point(0.22 + ox + j(1), 0.42 + j(2)),
      neck: point(0.3 + ox + j(3), 0.44 + j(4)),
      pelvis: point(0.58 + ox + j(5), 0.48 + j(6)),
      lShoulder: point(0.32 + ox + j(7), 0.38 + j(8)),
      rShoulder: point(0.32 + ox + j(9), 0.5 + j(10)),
      lElbow: point(0.4 + ox + j(11), 0.32 + j(12)),
      rElbow: point(0.4 + ox + j(13), 0.56 + j(14)),
      lWrist: point(0.5 + ox + j(15), 0.3 + j(16)),
      rWrist: point(0.5 + ox + j(17), 0.58 + j(18)),
      lHip: point(0.58 + ox + j(19), 0.42 + j(20)),
      rHip: point(0.58 + ox + j(21), 0.54 + j(22)),
      lKnee: point(0.72 + ox + j(23), 0.38 + j(24)),
      rKnee: point(0.72 + ox + j(25), 0.56 + j(26)),
      lAnkle: point(0.86 + ox + j(27), 0.36 + j(28)),
      rAnkle: point(0.86 + ox + j(29), 0.58 + j(30)),
    };
  } else if (intent.base === 'jump') {
    // Nuclear mid-air jump — figure floated high, knees tucked under hips, arms UP (not T-pose).
    // Prior ankles ~0.5 still read as planted beach stands to Qwen Edit.
    const ox = centerX - 0.5;
    const hard: StickSkeleton = {
      head: point(0.5 + ox + j(1), 0.02 + j(2)),
      neck: point(0.5 + ox + j(3), 0.08 + j(4)),
      pelvis: point(0.48 + ox + j(5), 0.22 + j(6)),
      lShoulder: point(0.34 + ox + j(7), 0.1 + j(8)),
      rShoulder: point(0.66 + ox + j(9), 0.1 + j(10)),
      // Arms raised overhead — T-pose outs collapse to fashion stands.
      lElbow: point(0.28 + ox + j(11), 0.02 + j(12)),
      rElbow: point(0.72 + ox + j(13), 0.02 + j(14)),
      lWrist: point(0.24 + ox + j(15), 0.0 + j(16)),
      rWrist: point(0.76 + ox + j(17), 0.0 + j(18)),
      lHip: point(0.4 + ox + j(19), 0.22 + j(20)),
      rHip: point(0.56 + ox + j(21), 0.22 + j(22)),
      // Knees tucked up toward hips — clear mid-air crouch.
      lKnee: point(0.34 + ox + j(23), 0.3 + j(24)),
      rKnee: point(0.64 + ox + j(25), 0.28 + j(26)),
      // Ankles high with empty ground below (~0.35–0.38).
      lAnkle: point(0.3 + ox + j(27), 0.36 + j(28)),
      rAnkle: point(0.68 + ox + j(29), 0.34 + j(30)),
    };
    return seededUnit(seed, 20) > 0.5 ? mirrorStickSkeleton(hard, centerX) : hard;
  } else if (intent.base === 'reach') {
    const tossLead =
      /^TOSSING\b/i.test(scene) ||
      /\b(toss(?:es|ing)?|throw(?:s|ing)?|frisbee|beach\s+ball)\b/i.test(scene);
    const ox = centerX - 0.5;
    if (tossLead) {
      // Nuclear toss — throwing arm cocked behind head, opposite arm forward, staggered stance.
      const hard: StickSkeleton = {
        head: point(0.52 + ox + j(1), 0.1 + j(2)),
        neck: point(0.5 + ox + j(3), 0.18 + j(4)),
        pelvis: point(0.46 + ox + j(5), 0.5 + j(6)),
        lShoulder: point(0.34 + ox + j(7), 0.2 + j(8)),
        rShoulder: point(0.64 + ox + j(9), 0.16 + j(10)),
        // Forward balance arm.
        lElbow: point(0.18 + ox + j(11), 0.32 + j(12)),
        lWrist: point(0.08 + ox + j(13), 0.28 + j(14)),
        // Cocked throw arm — elbow high behind, wrist back with ball.
        rElbow: point(0.78 + ox + j(15), 0.08 + j(16)),
        rWrist: point(0.88 + ox + j(17), 0.14 + j(18)),
        lHip: point(0.38 + ox + j(19), 0.5 + j(20)),
        rHip: point(0.54 + ox + j(21), 0.5 + j(22)),
        lKnee: point(0.28 + ox + j(23), 0.7 + j(24)),
        rKnee: point(0.66 + ox + j(25), 0.66 + j(26)),
        lAnkle: point(0.2 + ox + j(27), 0.9 + j(28)),
        rAnkle: point(0.74 + ox + j(29), 0.82 + j(30)),
      };
      return seededUnit(seed, 20) > 0.5 ? mirrorStickSkeleton(hard, centerX) : hard;
    }
    // Nuclear reach / stretch arm — one wrist overhead + weight shift, not arms-at-sides.
    const bothUp = intent.armLeft === 'up' && intent.armRight === 'up';
    const hard: StickSkeleton = {
      head: point(0.48 + ox + j(1), 0.08 + j(2)),
      neck: point(0.48 + ox + j(3), 0.16 + j(4)),
      pelvis: point(0.46 + ox + j(5), 0.5 + j(6)),
      lShoulder: point(0.34 + ox + j(7), 0.2 + j(8)),
      rShoulder: point(0.62 + ox + j(9), 0.18 + j(10)),
      lElbow: point(
        bothUp ? 0.26 + ox + j(11) : 0.22 + ox + j(11),
        bothUp ? 0.08 + j(12) : 0.36 + j(12)
      ),
      rElbow: point(0.72 + ox + j(13), 0.06 + j(14)),
      lWrist: point(
        bothUp ? 0.22 + ox + j(15) : 0.18 + ox + j(15),
        bothUp ? 0.02 + j(16) : 0.48 + j(16)
      ),
      rWrist: point(0.8 + ox + j(17), 0.02 + j(18)),
      lHip: point(0.38 + ox + j(19), 0.5 + j(20)),
      rHip: point(0.54 + ox + j(21), 0.48 + j(22)),
      lKnee: point(0.3 + ox + j(23), 0.7 + j(24)),
      rKnee: point(0.62 + ox + j(25), 0.62 + j(26)),
      lAnkle: point(0.24 + ox + j(27), 0.9 + j(28)),
      rAnkle: point(0.7 + ox + j(29), 0.78 + j(30)),
    };
    return seededUnit(seed, 20) > 0.5 ? mirrorStickSkeleton(hard, centerX) : hard;
  } else if (intent.base === 'walk' || intent.base === 'run') {
    const kickLead =
      /^KICKING\b/i.test(scene) || /\b(kick(?:s|ing)?|kicking\s+through)\b/i.test(scene);
    if (kickLead && intent.base === 'walk') {
      // Nuclear kick — support leg planted, opposite leg kicked nearly horizontal at hip height.
      const ox = centerX - 0.5;
      const hard: StickSkeleton = {
        head: point(0.46 + ox + j(1), 0.08 + j(2)),
        neck: point(0.46 + ox + j(3), 0.16 + j(4)),
        pelvis: point(0.44 + ox + j(5), 0.46 + j(6)),
        lShoulder: point(0.3 + ox + j(7), 0.18 + j(8)),
        rShoulder: point(0.62 + ox + j(9), 0.16 + j(10)),
        lElbow: point(0.12 + ox + j(11), 0.26 + j(12)),
        rElbow: point(0.82 + ox + j(13), 0.24 + j(14)),
        lWrist: point(0.02 + ox + j(15), 0.3 + j(16)),
        rWrist: point(0.95 + ox + j(17), 0.26 + j(18)),
        lHip: point(0.38 + ox + j(19), 0.46 + j(20)),
        rHip: point(0.52 + ox + j(21), 0.46 + j(22)),
        // Support leg straight down.
        lKnee: point(0.36 + ox + j(23), 0.7 + j(24)),
        lAnkle: point(0.34 + ox + j(25), 0.92 + j(26)),
        // Kicked leg nearly horizontal — ankle at hip height, far out.
        rKnee: point(0.78 + ox + j(27), 0.44 + j(28)),
        rAnkle: point(0.96 + ox + j(29), 0.4 + j(30)),
      };
      return seededUnit(seed, 20) > 0.5 ? mirrorStickSkeleton(hard, centerX) : hard;
    }
    // Nuclear mid-stride — must read as walking even when Keep Edit fights for a stand.
    // Wide ankle span + lifted forward foot + opposite arm swing + optional head-down.
    const ox = centerX - 0.5;
    const lookDown =
      /\b(look(?:ing)?\s+down|at\s+(?:the\s+)?(?:wet\s+)?sand|shells?|collect(?:ing)?|ground|feet|sparkle)\b/i.test(
        scene
      );
    const hard: StickSkeleton = {
      // Head forward/down when collecting — not a camera-facing catalog portrait.
      head: point(0.54 + ox + j(1), lookDown ? 0.22 + j(2) : 0.1 + j(2)),
      neck: point(0.5 + ox + j(3), lookDown ? 0.28 + j(4) : 0.18 + j(4)),
      pelvis: point(0.44 + ox + j(5), intent.base === 'run' ? 0.44 + j(6) : 0.5 + j(6)),
      lShoulder: point(0.34 + ox + j(7), lookDown ? 0.3 + j(8) : 0.22 + j(8)),
      rShoulder: point(0.66 + ox + j(9), lookDown ? 0.28 + j(10) : 0.2 + j(10)),
      // Opposite arm swing — back arm trails low (tote side), forward arm reaches ahead.
      lElbow: point(0.18 + ox + j(11), 0.42 + j(12)),
      rElbow: point(0.8 + ox + j(13), 0.26 + j(14)),
      lWrist: point(0.12 + ox + j(15), 0.58 + j(16)),
      rWrist: point(0.92 + ox + j(17), 0.18 + j(18)),
      lHip: point(0.38 + ox + j(19), 0.5 + j(20)),
      rHip: point(0.52 + ox + j(21), 0.5 + j(22)),
      lKnee: point(0.16 + ox + j(23), 0.68 + j(24)),
      rKnee: point(0.76 + ox + j(25), 0.52 + j(26)),
      // Planted rear foot + forward foot mid-air — never parallel planted stand.
      lAnkle: point(0.06 + ox + j(27), 0.92 + j(28)),
      rAnkle: point(0.9 + ox + j(29), 0.62 + j(30)),
    };
    return seededUnit(seed, 20) > 0.5 ? mirrorStickSkeleton(hard, centerX) : hard;
  }

  const cx = centerX + lean * 0.08;
  const neck = point(cx + j(1), headY + 0.08 * torsoScale + j(2));
  const head = point(cx + lean * 0.02 + j(3), headY + j(4));
  const pelvis = point(cx - lean * 0.02 + j(5), pelvisY + j(6));
  const lShoulder = point(neck.x - 0.12 + j(7), neck.y + 0.04 + j(8));
  const rShoulder = point(neck.x + 0.12 + j(9), neck.y + 0.03 + j(10));

  const leftArm = armChain(lShoulder, -1, intent.armLeft, seededUnit(seed, 11));
  const rightArm = armChain(rShoulder, 1, intent.armRight, seededUnit(seed, 12));

  const hipSpread = 0.06;
  const lHip = point(pelvis.x - hipSpread + j(13), pelvis.y + j(14));
  const rHip = point(pelvis.x + hipSpread + j(15), pelvis.y + j(16));

  const walkPhase = 0.35;
  const front = stride * walkPhase;
  const flip = seededUnit(seed, 20) > 0.5 ? 1 : -1;

  let lKnee: Point;
  let rKnee: Point;
  let lAnkle: Point;
  let rAnkle: Point;

  if (intent.base === 'sit' || intent.base === 'crouch') {
    // Chair-like L: knees forward of hips, ankles under/near knees — not a short stand.
    const kneeDrop = reclinedSit ? 0.08 : 0.1;
    const forward = reclinedSit ? 0.16 : perchedSit ? 0.12 : 0.14;
    lKnee = point(lHip.x - 0.02 + forward * 0.4 + j(17), lHip.y + kneeDrop + j(18));
    rKnee = point(rHip.x + forward + j(19), rHip.y + kneeDrop - 0.02 + j(20));
    lAnkle = point(lKnee.x - 0.02 + j(21), reclinedSit ? 0.86 : 0.9 + j(22) * 0.02);
    rAnkle = point(
      rKnee.x + (reclinedSit ? 0.1 : 0.04) + j(23),
      reclinedSit ? 0.82 : 0.88 + j(24) * 0.02
    );
    if (reclinedSit) {
      // One knee raised lounge cue.
      rKnee = point(rHip.x + 0.1 + j(19), rHip.y - 0.02 + j(20));
      rAnkle = point(rKnee.x + 0.06 + j(23), rKnee.y + 0.12 + j(24));
    }
  } else if (intent.base === 'kneel') {
    lKnee = point(lHip.x - 0.02 + j(17), 0.72 + j(18));
    rKnee = point(rHip.x + 0.08 + j(19), rHip.y + 0.14 + j(20));
    lAnkle = point(lKnee.x - 0.08 + j(21), 0.88 + j(22));
    rAnkle = point(rKnee.x + 0.04 + j(23), 0.86 + j(24));
  } else {
    // Standing / lean only — jump/reach/walk/run return earlier in this function.
    lKnee = point(lHip.x - front * 0.2 * flip + j(17), lHip.y + 0.18 + j(18));
    rKnee = point(rHip.x + front * 0.22 * flip + j(19), rHip.y + 0.16 + j(20));
    lAnkle = point(lKnee.x - front * 0.18 * flip + j(21), 0.86 + j(22));
    rAnkle = point(rKnee.x + front * 0.2 * flip + j(23), 0.84 + j(24));
  }

  const lElbow = leftArm.elbow;
  const rElbow = rightArm.elbow;
  const lWrist = leftArm.wrist;
  const rWrist = rightArm.wrist;

  return {
    head,
    neck,
    pelvis,
    lShoulder,
    rShoulder,
    lElbow,
    rElbow,
    lWrist,
    rWrist,
    lHip,
    rHip,
    lKnee,
    rKnee,
    lAnkle,
    rAnkle,
  };
}

/** Horizontally mirror L/R joints around a center (for facing a partner). */
export function mirrorStickSkeleton(skeleton: StickSkeleton, centerX = 0.5): StickSkeleton {
  const flip = (p: Point): Point => point(centerX * 2 - p.x, p.y);
  return {
    head: flip(skeleton.head),
    neck: flip(skeleton.neck),
    pelvis: flip(skeleton.pelvis),
    lShoulder: flip(skeleton.rShoulder),
    rShoulder: flip(skeleton.lShoulder),
    lElbow: flip(skeleton.rElbow),
    rElbow: flip(skeleton.lElbow),
    lWrist: flip(skeleton.rWrist),
    rWrist: flip(skeleton.lWrist),
    lHip: flip(skeleton.rHip),
    rHip: flip(skeleton.lHip),
    lKnee: flip(skeleton.rKnee),
    rKnee: flip(skeleton.lKnee),
    lAnkle: flip(skeleton.rAnkle),
    rAnkle: flip(skeleton.lAnkle),
    ...(skeleton.facing ? { facing: mirrorPoseFacing(skeleton.facing) } : {}),
  };
}

const DUO_CENTERS = [0.32, 0.68] as const;
const TRIO_CENTERS = [0.2, 0.5, 0.8] as const;

function lyingFigure(
  seed: number,
  opts: { cx: number; cy: number; facing: 1 | -1; salt: number }
): StickSkeleton {
  const j = (n: number) => (seededUnit(seed, opts.salt + n) - 0.5) * 0.03;
  const f = opts.facing;
  const { cx, cy } = opts;
  return {
    head: point(cx - 0.22 * f + j(1), cy - 0.02 + j(2)),
    neck: point(cx - 0.14 * f + j(3), cy + j(4)),
    pelvis: point(cx + 0.12 * f + j(5), cy + 0.02 + j(6)),
    lShoulder: point(cx - 0.12 * f + j(7), cy - 0.08 + j(8)),
    rShoulder: point(cx - 0.12 * f + j(9), cy + 0.08 + j(10)),
    lElbow: point(cx - 0.02 * f + j(11), cy - 0.12 + j(12)),
    rElbow: point(cx - 0.02 * f + j(13), cy + 0.12 + j(14)),
    lWrist: point(cx + 0.08 * f + j(15), cy - 0.1 + j(16)),
    rWrist: point(cx + 0.08 * f + j(17), cy + 0.1 + j(18)),
    lHip: point(cx + 0.12 * f + j(19), cy - 0.05 + j(20)),
    rHip: point(cx + 0.12 * f + j(21), cy + 0.05 + j(22)),
    lKnee: point(cx + 0.26 * f + j(23), cy - 0.08 + j(24)),
    rKnee: point(cx + 0.26 * f + j(25), cy + 0.08 + j(26)),
    lAnkle: point(cx + 0.38 * f + j(27), cy - 0.06 + j(28)),
    rAnkle: point(cx + 0.38 * f + j(29), cy + 0.06 + j(30)),
  };
}

function uprightFigure(
  seed: number,
  opts: {
    cx: number;
    base?: PoseGuideBase;
    salt: number;
    arms?: PoseGuideArm;
    lean?: number;
  }
): StickSkeleton {
  return synthesizeStickSkeleton(
    {
      base: opts.base ?? 'stand',
      armLeft: opts.arms ?? 'hold',
      armRight: opts.arms ?? 'hold',
      lean: opts.lean ?? 0,
      stride: 0.3,
      seed,
      people: 1,
      label: 'intimate-upright',
    },
    { centerX: opts.cx, seedSalt: opts.salt }
  );
}

function bentForwardFigure(seed: number, cx: number, salt: number): StickSkeleton {
  // Clear all-fours: hands planted forward, knees under hips, torso level.
  const j = (n: number) => (seededUnit(seed, salt + n) - 0.5) * 0.02;
  return {
    head: point(cx - 0.22 + j(1), 0.48 + j(2)),
    neck: point(cx - 0.14 + j(3), 0.46 + j(4)),
    pelvis: point(cx + 0.08 + j(5), 0.48 + j(6)),
    lShoulder: point(cx - 0.12 + j(7), 0.4 + j(8)),
    rShoulder: point(cx - 0.1 + j(9), 0.44 + j(10)),
    lElbow: point(cx - 0.2 + j(11), 0.52 + j(12)),
    rElbow: point(cx - 0.18 + j(13), 0.54 + j(14)),
    lWrist: point(cx - 0.26 + j(15), 0.68 + j(16)),
    rWrist: point(cx - 0.24 + j(17), 0.7 + j(18)),
    lHip: point(cx + 0.06 + j(19), 0.46 + j(20)),
    rHip: point(cx + 0.1 + j(21), 0.5 + j(22)),
    lKnee: point(cx + 0.06 + j(23), 0.68 + j(24)),
    rKnee: point(cx + 0.12 + j(25), 0.7 + j(26)),
    lAnkle: point(cx + 0.04 + j(27), 0.86 + j(28)),
    rAnkle: point(cx + 0.14 + j(29), 0.86 + j(30)),
  };
}

function legsRaisedBottom(seed: number, salt: number): StickSkeleton {
  const base = lyingFigure(seed, { cx: 0.5, cy: 0.58, facing: 1, salt });
  base.lKnee = point(0.62, 0.36);
  base.rKnee = point(0.68, 0.4);
  base.lAnkle = point(0.58, 0.22);
  base.rAnkle = point(0.64, 0.26);
  return base;
}

function riderOnPelvis(
  seed: number,
  opts: { cx: number; facingAway?: boolean; salt: number }
): StickSkeleton {
  const top = uprightFigure(seed, {
    cx: opts.cx,
    base: 'sit',
    salt: opts.salt,
    arms: 'hold',
  });
  top.pelvis = point(opts.cx, 0.5);
  top.lHip = point(opts.cx - 0.04, 0.5);
  top.rHip = point(opts.cx + 0.04, 0.5);
  if (opts.facingAway) {
    top.head = point(opts.cx + 0.02, 0.18);
    top.neck = point(opts.cx + 0.01, 0.26);
    top.lKnee = point(opts.cx - 0.12, 0.64);
    top.rKnee = point(opts.cx + 0.1, 0.64);
    top.lAnkle = point(opts.cx - 0.14, 0.8);
    top.rAnkle = point(opts.cx + 0.12, 0.8);
  } else {
    top.lKnee = point(opts.cx - 0.1, 0.64);
    top.rKnee = point(opts.cx + 0.1, 0.64);
    top.lAnkle = point(opts.cx - 0.12, 0.78);
    top.rAnkle = point(opts.cx + 0.12, 0.78);
  }
  return top;
}

function withThird(pair: StickSkeleton[], seed: number, cx = 0.82): StickSkeleton[] {
  return [...pair, uprightFigure(seed, { cx, base: 'stand', salt: 3, lean: -0.15 })];
}

/**
 * Nudge overlapping intimate figures so heads AND torsos stay readable as separate people.
 * Contact wrists may reach toward a partner, but pelvis/head centers must not collapse.
 */
function separateIntimateFigures(figures: StickSkeleton[]): StickSkeleton[] {
  if (figures.length < 2) {
    return figures;
  }
  const next = figures.map(fig => ({
    ...fig,
    head: { ...fig.head },
    neck: { ...fig.neck },
    pelvis: { ...fig.pelvis },
    lShoulder: { ...fig.lShoulder },
    rShoulder: { ...fig.rShoulder },
    lHip: { ...fig.lHip },
    rHip: { ...fig.rHip },
  }));
  const pushPair = (
    a: StickSkeleton,
    b: StickSkeleton,
    minDist: number,
    axis: 'head' | 'pelvis'
  ) => {
    const pa = axis === 'head' ? a.head : a.pelvis;
    const pb = axis === 'head' ? b.head : b.pelvis;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= minDist) {
      return;
    }
    const pushX = (dx === 0 ? 0.08 : (dx / Math.max(dist, 0.01)) * 0.06) || 0.06;
    const pushY = dy === 0 ? 0.04 : (dy / Math.max(dist, 0.01)) * 0.04;
    const scale = dist < 0.02 ? 1 : (minDist - dist) / Math.max(dist, 0.01);
    const sx = pushX * Math.max(scale, 0.55);
    const sy = pushY * Math.max(scale, 0.55);
    if (axis === 'head') {
      b.head = point(b.head.x + sx, b.head.y + sy);
      b.neck = point(b.neck.x + sx * 0.7, b.neck.y + sy * 0.5);
    } else {
      b.pelvis = point(b.pelvis.x + sx, b.pelvis.y + sy * 0.5);
      b.lHip = point(b.lHip.x + sx, b.lHip.y + sy * 0.5);
      b.rHip = point(b.rHip.x + sx, b.rHip.y + sy * 0.5);
      b.lShoulder = point(b.lShoulder.x + sx * 0.5, b.lShoulder.y);
      b.rShoulder = point(b.rShoulder.x + sx * 0.5, b.rShoulder.y);
    }
  };
  for (let i = 1; i < next.length; i += 1) {
    // Wider gaps — tight pelvis/head spacing still collapses into flesh blobs on Edit.
    pushPair(next[i - 1]!, next[i]!, 0.22, 'head');
    pushPair(next[i - 1]!, next[i]!, 0.18, 'pelvis');
  }
  // Third figure: pull farther right so they don't sit on the pair.
  if (next.length >= 3) {
    const third = next[2]!;
    third.head = point(Math.max(third.head.x, 0.78), third.head.y);
    third.neck = point(Math.max(third.neck.x, 0.78), third.neck.y);
    third.pelvis = point(Math.max(third.pelvis.x, 0.76), third.pelvis.y);
  }
  return next;
}

/**
 * Reach wrists toward a partner contact zone without collapsing onto their pelvis
 * (overlapping sticks made Qwen merge people).
 */
function plantHandsOnPartner(
  actor: StickSkeleton,
  target: StickSkeleton,
  options?: { toward?: 'hips' | 'chest' | 'pelvis' }
): StickSkeleton {
  const zone = options?.toward ?? 'hips';
  const targetPoint =
    zone === 'chest'
      ? point((target.lShoulder.x + target.rShoulder.x) / 2, (target.neck.y + target.pelvis.y) / 2)
      : zone === 'pelvis'
        ? point(target.pelvis.x, target.pelvis.y)
        : point((target.lHip.x + target.rHip.x) / 2, (target.lHip.y + target.rHip.y) / 2);
  // Stop short of the target body (~72% of the way) so torsos stay two separate people.
  const reach = (from: Point, side: number) =>
    point(
      from.x + (targetPoint.x - from.x) * 0.72 + side * 0.02,
      from.y + (targetPoint.y - from.y) * 0.72
    );
  const lWrist = reach(actor.lShoulder, -1);
  const rWrist = reach(actor.rShoulder, 1);
  return {
    ...actor,
    lElbow: point((actor.lShoulder.x + lWrist.x) / 2, (actor.lShoulder.y + lWrist.y) / 2),
    rElbow: point((actor.rShoulder.x + rWrist.x) / 2, (actor.rShoulder.y + rWrist.y) / 2),
    lWrist,
    rWrist,
  };
}

/**
 * Default pair order is [leadRole, partnerRole]. Return true when the Cast lead
 * should instead take the second slot (giver / rear / bottom / carrier…).
 */
export function intimateLeadPrefersSecondRole(
  text: string | null | undefined,
  layout: IntimateLayout | null | undefined
): boolean {
  const hay = text?.trim() || '';
  if (!hay || !layout) {
    return false;
  }
  // Subject pronouns only — avoid matching object "him/her" mid-clause.
  const sheGivesOral =
    /\bshe\b.{0,48}\b(licks?|laps?|sucks?|goes?\s+down\s+on|blow\s*jobs?|oral)\b/i.test(hay);
  const heGivesOral = /\bhe\b.{0,48}\b(licks?|laps?|sucks?|goes?\s+down\s+on|tongue)\b/i.test(hay);
  const sheFromBehind = /\bshe\b.{0,48}\b(from\s+behind|doggy|takes?\s+him|fucks?\s+him)\b/i.test(
    hay
  );
  const heFromBehind = /\bhe\b.{0,48}\b(from\s+behind|doggy|takes?\s+her|fucks?\s+her)\b/i.test(
    hay
  );
  const sheRides = /\bshe\b.{0,40}\b(straddl|rid(?:es|ing)|cowgirl|on\s+top)\b/i.test(hay);
  const heRides = /\bhe\b.{0,40}\b(straddl|rid(?:es|ing)|on\s+top)\b/i.test(hay);
  const shePinned = /\bshe\b.{0,40}\b(pinned|against\s+the\s+wall|pressed)\b/i.test(hay);
  const sheLifted = /\bshe\b.{0,40}\b(lifted|picked\s+up|held\s+up|legs?\s+wrapped)\b/i.test(hay);
  const sheCarries = /\bshe\b.{0,40}\b(lifts?|carrying|holds?\s+him)\b/i.test(hay);

  switch (layout) {
    case 'oral':
      // Default [receiver, giver] — swap when lead is the giver.
      if (sheGivesOral && !heGivesOral) {
        return true;
      }
      return false;
    case 'bent':
    case 'prone':
      // Default [bent/front, rear] — swap when lead is the one behind.
      if (sheFromBehind && !heFromBehind) {
        return true;
      }
      return false;
    case 'straddle':
    case 'reverse_straddle':
      // Default [rider/top, bottom] — swap when lead is underneath.
      if (heRides && !sheRides) {
        return true;
      }
      return false;
    case 'missionary':
    case 'mating_press':
      // Default [bottom, top] — swap when lead is clearly on top.
      if (sheRides) {
        return true;
      }
      return false;
    case 'wall':
      // Default [against, press] — swap when lead is the one pressing in.
      if (!shePinned && /\bshe\b.{0,40}\b(pins?|presses?|fucks?)\b/i.test(hay)) {
        return true;
      }
      return false;
    case 'lift':
      // Default [lifted, carrier] — swap when lead is carrying.
      if (sheCarries && !sheLifted) {
        return true;
      }
      return false;
    case 'facesit':
      return false;
    default:
      return false;
  }
}

function withLeadFirst(pair: [StickSkeleton, StickSkeleton], swap: boolean): StickSkeleton[] {
  return swap ? [pair[1], pair[0]] : [pair[0], pair[1]];
}

/**
 * Lowering onto a chaise: partner stands holding her mid-air (legs dangling) —
 * wrapped-leg lift silhouettes read as cowgirl couch straddles.
 */
function chaiseLowerFigures(): StickSkeleton[] {
  // Side carry-lower: both facing right toward the chaise — not a face-to-face kiss cling.
  const carrier: StickSkeleton = {
    head: point(0.32, 0.1),
    neck: point(0.34, 0.18),
    pelvis: point(0.36, 0.5),
    lShoulder: point(0.28, 0.22),
    rShoulder: point(0.4, 0.2),
    lElbow: point(0.34, 0.36),
    rElbow: point(0.46, 0.34),
    lWrist: point(0.42, 0.48),
    rWrist: point(0.5, 0.44),
    lHip: point(0.33, 0.5),
    rHip: point(0.39, 0.5),
    lKnee: point(0.34, 0.7),
    rKnee: point(0.4, 0.7),
    lAnkle: point(0.34, 0.92),
    rAnkle: point(0.4, 0.92),
  };
  const lifted: StickSkeleton = {
    // Head at his shoulder height, offset forward — cheek to shoulder, not lip-aligned.
    head: point(0.44, 0.14),
    neck: point(0.46, 0.22),
    pelvis: point(0.52, 0.48),
    lShoulder: point(0.42, 0.24),
    rShoulder: point(0.54, 0.26),
    // Arms around his neck from the side.
    lElbow: point(0.38, 0.18),
    rElbow: point(0.4, 0.16),
    lWrist: point(0.34, 0.12),
    rWrist: point(0.36, 0.1),
    lHip: point(0.48, 0.48),
    rHip: point(0.56, 0.48),
    // Legs dangling toward the chaise — not a third limb between his.
    lKnee: point(0.5, 0.66),
    rKnee: point(0.6, 0.64),
    lAnkle: point(0.52, 0.84),
    rAnkle: point(0.64, 0.82),
  };
  return separateIntimateFigures([lifted, carrier]);
}

/**
 * Standing bent over chair back: hands plant forward on the chair (like desk bent).
 * Arms-reaching-back-to-neck mannequins made Edit sit + twist 180°.
 */
function chairBentFigures(): StickSkeleton[] {
  const bent: StickSkeleton = {
    head: point(0.18, 0.34),
    neck: point(0.24, 0.36),
    pelvis: point(0.44, 0.46),
    lShoulder: point(0.26, 0.38),
    rShoulder: point(0.32, 0.4),
    // Hands planted forward on chair — not reaching back to partner neck.
    lElbow: point(0.16, 0.44),
    rElbow: point(0.18, 0.46),
    lWrist: point(0.1, 0.5),
    rWrist: point(0.12, 0.52),
    lHip: point(0.41, 0.46),
    rHip: point(0.47, 0.46),
    lKnee: point(0.42, 0.7),
    rKnee: point(0.48, 0.7),
    lAnkle: point(0.42, 0.92),
    rAnkle: point(0.48, 0.92),
    facing: 'left',
  };
  const rear: StickSkeleton = {
    facing: 'left',
    head: point(0.62, 0.12),
    neck: point(0.62, 0.2),
    pelvis: point(0.58, 0.5),
    lShoulder: point(0.52, 0.24),
    rShoulder: point(0.7, 0.24),
    lElbow: point(0.5, 0.38),
    rElbow: point(0.52, 0.42),
    lWrist: point(0.48, 0.48),
    rWrist: point(0.44, 0.54),
    lHip: point(0.55, 0.5),
    rHip: point(0.61, 0.5),
    lKnee: point(0.56, 0.7),
    rKnee: point(0.62, 0.7),
    lAnkle: point(0.56, 0.92),
    rAnkle: point(0.62, 0.92),
  };
  return separateIntimateFigures([bent, rear]);
}

/**
 * Desk / ledger / table bent: standing lean over a surface — not carpet all-fours.
 * Optional throat+core hands when the beat names a throat grab.
 */
function deskBentFigures(options?: { throatGrab?: boolean }): StickSkeleton[] {
  const bent: StickSkeleton = {
    head: point(0.22, 0.32),
    neck: point(0.28, 0.34),
    pelvis: point(0.44, 0.48),
    lShoulder: point(0.26, 0.36),
    rShoulder: point(0.32, 0.38),
    // Hands planted on desk surface ahead.
    lElbow: point(0.18, 0.42),
    rElbow: point(0.2, 0.44),
    lWrist: point(0.12, 0.46),
    rWrist: point(0.14, 0.48),
    lHip: point(0.41, 0.48),
    rHip: point(0.47, 0.48),
    lKnee: point(0.42, 0.7),
    rKnee: point(0.48, 0.7),
    lAnkle: point(0.42, 0.92),
    rAnkle: point(0.48, 0.92),
    facing: 'left',
  };
  const rear: StickSkeleton = {
    facing: 'left',
    head: point(0.6, 0.12),
    neck: point(0.6, 0.2),
    pelvis: point(0.58, 0.5),
    lShoulder: point(0.52, 0.24),
    rShoulder: point(0.68, 0.24),
    lElbow: point(0.48, 0.38),
    rElbow: point(0.54, 0.36),
    // Default: both hands on hips.
    lWrist: point(0.46, 0.48),
    rWrist: point(0.5, 0.46),
    lHip: point(0.55, 0.5),
    rHip: point(0.61, 0.5),
    lKnee: point(0.56, 0.7),
    rKnee: point(0.62, 0.7),
    lAnkle: point(0.56, 0.92),
    rAnkle: point(0.62, 0.92),
  };
  if (options?.throatGrab) {
    // Upper hand toward lead neck/throat; lower toward pelvis/crotch (wall-press pattern).
    rear.lElbow = point(0.42, 0.32);
    rear.lWrist = point(0.32, 0.34);
    rear.rElbow = point(0.5, 0.42);
    rear.rWrist = point(0.42, 0.5);
  }
  return separateIntimateFigures([bent, rear]);
}

/**
 * Filing-cabinet open drawer: lead slumped sideways at drawer height;
 * partner stands behind — not desk lean, not carpet all-fours.
 */
function cabinetDrawerFigures(): StickSkeleton[] {
  // Sideways collapse into a low open drawer (hips mid-height, torso along the drawer).
  const slumped: StickSkeleton = {
    head: point(0.16, 0.42),
    neck: point(0.22, 0.44),
    pelvis: point(0.4, 0.56),
    lShoulder: point(0.22, 0.48),
    rShoulder: point(0.28, 0.46),
    // Arms bracing the drawer / cabinet face.
    lElbow: point(0.14, 0.54),
    rElbow: point(0.18, 0.52),
    lWrist: point(0.08, 0.58),
    rWrist: point(0.12, 0.56),
    lHip: point(0.37, 0.56),
    rHip: point(0.43, 0.56),
    // Thighs parted — one leg forward, one back.
    lKnee: point(0.36, 0.74),
    rKnee: point(0.5, 0.72),
    lAnkle: point(0.34, 0.92),
    rAnkle: point(0.54, 0.9),
    facing: 'left',
  };
  const rear: StickSkeleton = {
    facing: 'left',
    head: point(0.66, 0.1),
    neck: point(0.66, 0.18),
    pelvis: point(0.58, 0.52),
    lShoulder: point(0.56, 0.22),
    rShoulder: point(0.74, 0.22),
    lElbow: point(0.5, 0.38),
    rElbow: point(0.54, 0.4),
    // Waist + between-thighs reach.
    lWrist: point(0.44, 0.52),
    rWrist: point(0.42, 0.58),
    lHip: point(0.55, 0.52),
    rHip: point(0.61, 0.52),
    lKnee: point(0.56, 0.72),
    rKnee: point(0.64, 0.72),
    lAnkle: point(0.56, 0.92),
    rAnkle: point(0.64, 0.92),
  };
  return separateIntimateFigures([slumped, rear]);
}

/**
 * Standing wall sex: lead's back to the left wall, partner behind (same facing),
 * both full height with feet on the floor — never a face-to-face floor kneel.
 * Head at collarbone height + throat/core hands so Edit doesn't invent a mouth kiss.
 */
function wallPressStandingFigures(): StickSkeleton[] {
  // Pressed to the left wall bar — not center-cab facing camera with a front rail.
  // Both face the wall (image left): OpenPose shows two profiles, not a face-to-face pair.
  const against: StickSkeleton = {
    facing: 'left',
    head: point(0.22, 0.1),
    neck: point(0.22, 0.18),
    pelvis: point(0.24, 0.5),
    lShoulder: point(0.14, 0.22),
    rShoulder: point(0.3, 0.22),
    // Palms on the wall ahead/left — not a forward handrail grip.
    lElbow: point(0.1, 0.3),
    rElbow: point(0.12, 0.34),
    lWrist: point(0.06, 0.28),
    rWrist: point(0.08, 0.36),
    lHip: point(0.21, 0.5),
    rHip: point(0.27, 0.5),
    lKnee: point(0.22, 0.7),
    rKnee: point(0.28, 0.7),
    lAnkle: point(0.22, 0.92),
    rAnkle: point(0.28, 0.92),
  };
  const press: StickSkeleton = {
    facing: 'left',
    // Head clearly visible over her shoulder in camera (not buried / reflection-only).
    head: point(0.38, 0.16),
    neck: point(0.38, 0.26),
    pelvis: point(0.38, 0.5),
    lShoulder: point(0.3, 0.3),
    rShoulder: point(0.46, 0.28),
    lElbow: point(0.26, 0.48),
    rElbow: point(0.26, 0.26),
    // Placeholders — overwritten after separateIntimateFigures.
    lWrist: point(0.25, 0.62),
    rWrist: point(0.23, 0.12),
    lHip: point(0.35, 0.5),
    rHip: point(0.41, 0.5),
    lKnee: point(0.36, 0.7),
    rKnee: point(0.42, 0.7),
    lAnkle: point(0.36, 0.92),
    rAnkle: point(0.42, 0.92),
  };
  const [lead, partner] = separateIntimateFigures([against, press]) as [
    StickSkeleton,
    StickSkeleton,
  ];
  // Re-pin contact after torso separation — one contact wrist only (ghost-hand risk).
  partner.rWrist = point(lead.neck.x + 0.02, lead.neck.y + 0.01);
  partner.lWrist = point(partner.lHip.x - 0.04, partner.lHip.y + 0.02);
  partner.rElbow = point(
    (partner.rShoulder.x + partner.rWrist.x) / 2,
    (partner.rShoulder.y + partner.rWrist.y) / 2
  );
  partner.lElbow = point(
    (partner.lShoulder.x + partner.lWrist.x) / 2,
    (partner.lShoulder.y + partner.lWrist.y) / 2
  );
  return [lead, partner];
}

/** Solo masturbation Image 3 stance kinds — one adult, hand toward pelvis. */
export type SoloMasturbationPoseKind =
  'on_back' | 'side_lying' | 'prone' | 'kneeling' | 'all_fours' | 'standing' | 'lean' | 'seated';

/**
 * Classify solo self-touch stance from beat/scene text.
 * Used for Image 3 wireframes so every common masturbation pose has a dedicated layout.
 */
export function resolveSoloMasturbationPoseKind(
  sceneText: string | null | undefined
): SoloMasturbationPoseKind {
  const text = sceneText?.trim() || '';
  if (
    /\b(all\s+fours|on\s+(?:her|his|their)\s+hands\s+and\s+knees|bent\s+over|ass[- ]up|hips\s+high|looking\s+back)\b/i.test(
      text
    )
  ) {
    return 'all_fours';
  }
  if (
    /\b(face[- ]down|prone|on\s+(?:her|his|their)\s+stomach|lying\s+on\s+(?:her|his|their)\s+front|grinding\s+into\s+the\s+mattress)\b/i.test(
      text
    )
  ) {
    return 'prone';
  }
  if (
    /\b(side[- ]lying|on\s+(?:her|his|their)\s+side|curled\s+on\s+(?:her|his|their)\s+side|top\s+knee)\b/i.test(
      text
    )
  ) {
    return 'side_lying';
  }
  if (
    (/\bon\s+(?:her|his|their)\s+back\b|\blying\b|\breclin|\bsupine\b|\bankles?\s+near\s+(?:her|his|their)\s+shoulders\b/i.test(
      text
    ) ||
      /\bknees\s+pulled\s+up\b/i.test(text)) &&
    !/\bkneel|sit(?:ting)?\s+on\s+the\s+(?:bed\s+)?edge|lean|side|stomach|prone|all\s+fours|windowsill|pillow/i.test(
      text
    )
  ) {
    return 'on_back';
  }
  if (/\bkneel|riding\s+her\s+own\s+hand\b/i.test(text)) {
    return 'kneeling';
  }
  if (
    /\b(sink|counter|lean(?:ing)?\s+(?:on|against)|against\s+the\s+(?:sink|counter|wall)|windowsill|straddl(?:e|ing)\s+(?:a\s+)?(?:bathroom\s+)?sink|minibar)\b/i.test(
      text
    )
  ) {
    return 'lean';
  }
  if (
    /\b(standing|shower|pressed\s+to\s+the\s+wall|hallway\s+wall|upright)\b/i.test(text) &&
    !/\bsit|kneel|couch|chair|bed\s+edge|pillow|windowsill\b/i.test(text)
  ) {
    return 'standing';
  }
  if (
    /\b(astride|straddl(?:e|ing)\s+(?:a\s+)?pillow|bed\s+edge|couch|reclining|stool)\b/i.test(text)
  ) {
    return 'seated';
  }
  return 'seated';
}

function plantSoloSelfTouchHands(body: StickSkeleton): StickSkeleton {
  // One fingering wrist on the vulva midline; the other rests low on the hip with
  // a clear shoulder→elbow→wrist chain. Two mid-vulva wrists often spawn a ghost
  // covering pair on the chest in Rapid Edit (four-hand softcore).
  body.rWrist = point(body.pelvis.x + 0.01, body.pelvis.y + 0.15);
  body.lWrist = point(body.pelvis.x - 0.14, body.pelvis.y + 0.06);
  body.rElbow = point(body.pelvis.x + 0.07, body.pelvis.y + 0.06);
  body.lElbow = point(body.pelvis.x - 0.12, body.pelvis.y - 0.02);
  body.lShoulder = point(body.lShoulder.x, Math.min(body.lShoulder.y + 0.03, body.pelvis.y - 0.06));
  body.rShoulder = point(body.rShoulder.x, Math.min(body.rShoulder.y + 0.03, body.pelvis.y - 0.06));
  return body;
}

/** One-adult self-touch wireframes — expressive stances, not polite pin-ups. */
function synthesizeSoloMasturbationFigure(
  seed: number,
  sceneText: string | null | undefined
): StickSkeleton {
  const kind = resolveSoloMasturbationPoseKind(sceneText);
  const text = sceneText?.trim() || '';

  if (kind === 'on_back') {
    const body = lyingFigure(seed, { cx: 0.5, cy: 0.54, facing: 1, salt: 11 });
    // Knees up / ankles high so Edit reads open thighs, not a flat nap.
    const legsHigh = /\bankles?\s+near|knees\s+pulled\s+up|shoulders\b/i.test(text);
    body.lKnee = point(body.pelvis.x - 0.12, body.pelvis.y - (legsHigh ? 0.22 : 0.14));
    body.rKnee = point(body.pelvis.x + 0.14, body.pelvis.y - (legsHigh ? 0.2 : 0.12));
    body.lAnkle = point(body.pelvis.x - 0.08, body.pelvis.y - (legsHigh ? 0.32 : 0.18));
    body.rAnkle = point(body.pelvis.x + 0.16, body.pelvis.y - (legsHigh ? 0.3 : 0.16));
    body.head = point(body.head.x, body.head.y + 0.03);
    return plantSoloSelfTouchHands(body);
  }

  if (kind === 'side_lying') {
    const body = lyingFigure(seed, { cx: 0.48, cy: 0.5, facing: 1, salt: 51 });
    body.lKnee = point(body.pelvis.x + 0.14, body.pelvis.y - 0.08);
    body.rKnee = point(body.pelvis.x + 0.22, body.pelvis.y + 0.06);
    body.lAnkle = point(body.pelvis.x + 0.28, body.pelvis.y - 0.06);
    body.rAnkle = point(body.pelvis.x + 0.34, body.pelvis.y + 0.08);
    body.head = point(body.head.x - 0.02, body.head.y + 0.02);
    return plantSoloSelfTouchHands(body);
  }

  if (kind === 'prone') {
    const body = lyingFigure(seed, { cx: 0.5, cy: 0.48, facing: -1, salt: 61 });
    body.head = point(body.head.x + 0.04, body.head.y + 0.02);
    body.pelvis = point(body.pelvis.x, body.pelvis.y - 0.04);
    body.lKnee = point(body.pelvis.x - 0.06, body.pelvis.y + 0.12);
    body.rKnee = point(body.pelvis.x + 0.1, body.pelvis.y + 0.14);
    return plantSoloSelfTouchHands(body);
  }

  if (kind === 'kneeling') {
    const body = uprightFigure(seed, {
      cx: 0.5,
      base: 'kneel',
      salt: 21,
      // Forward/down arms before plant — 'hold' leaves shoulders reading as a raised gesture.
      arms: 'forward',
      lean: 0.18,
    });
    // Head tipped back / down — never a polite camera-facing pin-up with raised hands.
    body.head = point(body.head.x + 0.05, body.head.y - 0.08);
    body.neck = point(body.neck.x + 0.03, body.neck.y - 0.03);
    body.lKnee = point(body.lKnee.x - 0.1, body.lKnee.y);
    body.rKnee = point(body.rKnee.x + 0.1, body.rKnee.y);
    body.pelvis = point(body.pelvis.x, body.pelvis.y + 0.03);
    // One fingering wrist deep on the vulva; other on the hip (clear arm chains).
    const planted = plantSoloSelfTouchHands(body);
    planted.lShoulder = point(
      planted.lShoulder.x,
      Math.min(planted.lShoulder.y + 0.04, planted.pelvis.y - 0.08)
    );
    planted.rShoulder = point(
      planted.rShoulder.x,
      Math.min(planted.rShoulder.y + 0.04, planted.pelvis.y - 0.08)
    );
    planted.rWrist = point(planted.pelvis.x + 0.01, planted.pelvis.y + 0.17);
    planted.lWrist = point(planted.pelvis.x - 0.15, planted.pelvis.y + 0.07);
    planted.rElbow = point(planted.pelvis.x + 0.06, planted.pelvis.y + 0.07);
    planted.lElbow = point(planted.pelvis.x - 0.13, planted.pelvis.y - 0.01);
    return planted;
  }

  if (kind === 'all_fours') {
    const body = bentForwardFigure(seed, 0.5, 71);
    body.head = point(body.head.x - 0.04, body.head.y - 0.02);
    body.pelvis = point(body.pelvis.x + 0.02, body.pelvis.y - 0.04);
    return plantSoloSelfTouchHands(body);
  }

  if (kind === 'lean') {
    return plantSoloSelfTouchHands(
      uprightFigure(seed, {
        cx: 0.48,
        base: 'stand',
        salt: 31,
        arms: 'forward',
        lean: 0.28,
      })
    );
  }

  if (kind === 'standing') {
    const body = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 81,
      arms: 'forward',
      lean: 0.1,
    });
    body.lKnee = point(body.lKnee.x - 0.06, body.lKnee.y - 0.04);
    body.lAnkle = point(body.lAnkle.x - 0.04, body.lAnkle.y);
    return plantSoloSelfTouchHands(body);
  }

  // Seated / couch / bed edge / windowsill / pillow — open thighs, lean back.
  const bedEdge =
    /\bbed\s+edge|edge\s+of\s+the\s+bed|sitting\s+on\s+the\s+edge|leaning\s+back\b/i.test(text);
  const body = uprightFigure(seed, {
    cx: 0.5,
    base: 'sit',
    salt: bedEdge ? 41 : 1,
    arms: 'forward',
    lean: bedEdge ? -0.12 : 0.08,
  });
  body.lKnee = point(body.lKnee.x - 0.07, body.lKnee.y);
  body.rKnee = point(body.rKnee.x + 0.08, body.rKnee.y);
  body.lAnkle = point(body.lAnkle.x - 0.05, body.lAnkle.y);
  body.rAnkle = point(body.rAnkle.x + 0.06, body.rAnkle.y);
  // Tip the head back / away from the lens — seated softcore defaults to camera stare.
  body.head = point(body.head.x + 0.03, body.head.y - (bedEdge ? 0.04 : 0.05));
  body.neck = point(body.neck.x + 0.01, body.neck.y - 0.02);
  return plantSoloSelfTouchHands(body);
}

/** Dedicated intimate solo/duo/trio layouts — wireframe silhouettes only. */
export function synthesizeIntimateStickFigures(intent: PoseGuideIntent): StickSkeleton[] {
  const layout = intent.intimate ?? 'generic';
  const seed = intent.seed;
  const wantTrio = intent.people >= 3;
  const swapLead = intimateLeadPrefersSecondRole(intent.sceneText, layout);
  const pairOrTrio = (pair: StickSkeleton[]) => {
    const ordered = pair.length >= 2 ? withLeadFirst([pair[0]!, pair[1]!], swapLead) : pair;
    const rest = pair.length > 2 ? pair.slice(2) : [];
    return separateIntimateFigures(
      wantTrio ? withThird([...ordered, ...rest], seed) : [...ordered, ...rest]
    );
  };

  if (layout === 'solo') {
    return [synthesizeSoloMasturbationFigure(seed, intent.sceneText)];
  }

  if (layout === 'missionary') {
    // Offset heads left/right + vertical stack so Qwen doesn't read one body.
    const bottom = lyingFigure(seed, { cx: 0.46, cy: 0.58, facing: 1, salt: 40 });
    let top = lyingFigure(seed, { cx: 0.58, cy: 0.4, facing: 1, salt: 80 });
    top = plantHandsOnPartner(top, bottom, { toward: 'hips' });
    return pairOrTrio([bottom, top]);
  }

  if (layout === 'mating_press') {
    const bottom = legsRaisedBottom(seed, 40);
    bottom.head = point(0.4, 0.58);
    bottom.neck = point(0.46, 0.56);
    let top = lyingFigure(seed, { cx: 0.58, cy: 0.38, facing: 1, salt: 80 });
    top.lKnee = point(0.5, 0.55);
    top.rKnee = point(0.6, 0.55);
    top.lAnkle = point(0.48, 0.68);
    top.rAnkle = point(0.62, 0.68);
    top = plantHandsOnPartner(top, bottom, { toward: 'chest' });
    return pairOrTrio([bottom, top]);
  }

  if (layout === 'straddle') {
    // Lead (black / Image 1) is the rider when the beat is "name straddles partner".
    // Keep pelvis centers farther apart so Edit doesn't fuse into one hip mass.
    // One contact wrist only — two planted wrists often become ghost hands on Edit.
    const bottom = lyingFigure(seed, { cx: 0.34, cy: 0.64, facing: 1, salt: 40 });
    const top = riderOnPelvis(seed, { cx: 0.64, salt: 2 });
    top.head = point(0.66, 0.12);
    top.neck = point(0.64, 0.2);
    top.rWrist = point(bottom.neck.x + 0.04, (bottom.neck.y + bottom.pelvis.y) / 2);
    top.lWrist = point(top.lHip.x - 0.05, top.lHip.y - 0.02);
    top.rElbow = point((top.rShoulder.x + top.rWrist.x) / 2, (top.rShoulder.y + top.rWrist.y) / 2);
    top.lElbow = point((top.lShoulder.x + top.lWrist.x) / 2, (top.lShoulder.y + top.lWrist.y) / 2);
    return pairOrTrio([top, bottom]);
  }

  if (layout === 'reverse_straddle') {
    const bottom = lyingFigure(seed, { cx: 0.34, cy: 0.64, facing: 1, salt: 40 });
    const top = riderOnPelvis(seed, { cx: 0.64, facingAway: true, salt: 2 });
    top.facing = 'back';
    top.head = point(0.68, 0.12);
    top.neck = point(0.66, 0.2);
    // One contact wrist only (same ghost-hand risk as face-to-face straddle).
    top.lWrist = point(bottom.pelvis.x + 0.02, bottom.pelvis.y - 0.04);
    top.rWrist = point(top.rHip.x + 0.05, top.rHip.y - 0.02);
    top.lElbow = point((top.lShoulder.x + top.lWrist.x) / 2, (top.lShoulder.y + top.lWrist.y) / 2);
    top.rElbow = point((top.rShoulder.x + top.rWrist.x) / 2, (top.rShoulder.y + top.rWrist.y) / 2);
    return pairOrTrio([top, bottom]);
  }

  if (layout === 'prone') {
    const bottom = lyingFigure(seed, { cx: 0.42, cy: 0.58, facing: 1, salt: 40 });
    bottom.head = point(0.24, 0.54);
    bottom.neck = point(0.32, 0.56);
    const top = lyingFigure(seed, { cx: 0.6, cy: 0.42, facing: 1, salt: 90 });
    // Face-down, seen from above: back-of-head keypoints, not two faces up at the camera.
    bottom.facing = 'back';
    top.facing = 'back';
    return pairOrTrio([bottom, top]);
  }

  if (layout === 'spoon') {
    const back = lyingFigure(seed, { cx: 0.38, cy: 0.48, facing: 1, salt: 40 });
    const front = lyingFigure(seed, { cx: 0.58, cy: 0.54, facing: 1, salt: 90 });
    return pairOrTrio([back, front]);
  }

  if (layout === 'scissors') {
    const left = lyingFigure(seed, { cx: 0.34, cy: 0.46, facing: 1, salt: 40 });
    const right = lyingFigure(seed, { cx: 0.66, cy: 0.54, facing: -1, salt: 90 });
    // Overlap midsections for scissor silhouette.
    left.lAnkle = point(0.58, 0.42);
    left.rAnkle = point(0.6, 0.55);
    right.lAnkle = point(0.4, 0.44);
    right.rAnkle = point(0.42, 0.56);
    return pairOrTrio([left, right]);
  }

  if (layout === 'sixty_nine') {
    const top = lyingFigure(seed, { cx: 0.42, cy: 0.38, facing: 1, salt: 40 });
    const bottom = lyingFigure(seed, { cx: 0.58, cy: 0.6, facing: -1, salt: 90 });
    return pairOrTrio([top, bottom]);
  }

  if (layout === 'afterglow') {
    const a = lyingFigure(seed, { cx: 0.38, cy: 0.5, facing: 1, salt: 40 });
    const b = lyingFigure(seed, { cx: 0.6, cy: 0.46, facing: -1, salt: 80 });
    a.lWrist = point(0.48, 0.44);
    b.rWrist = point(0.5, 0.46);
    return pairOrTrio([a, b]);
  }

  if (layout === 'bent') {
    const scene = intent.sceneText || '';
    if (
      /\b(chair|ergonomic)\b/i.test(scene) &&
      /\b(hunch(?:ed|ing)?|bent\s+over|lean(?:s|ing)?\s+over|over\s+the|arms?\s+locked\s+around)\b/i.test(
        scene
      )
    ) {
      return pairOrTrio(chairBentFigures());
    }
    if (intimateTextImpliesCabinetDrawer(scene)) {
      return pairOrTrio(cabinetDrawerFigures());
    }
    if (intimateTextImpliesSurfaceBent(scene)) {
      return pairOrTrio(
        deskBentFigures({
          throatGrab: /\bthroat\b/i.test(scene),
        })
      );
    }
    // Wider gap + kneeling rear partner so Edit doesn't invent standing extra limbs.
    const bent = bentForwardFigure(seed, 0.28, 50);
    let rear = uprightFigure(seed, {
      cx: 0.76,
      base: 'kneel',
      salt: 2,
      arms: 'hold',
      lean: -0.12,
    });
    // Reach toward hips without collapsing pelvis centers (merge risk).
    rear = plantHandsOnPartner(rear, bent, { toward: 'hips' });
    rear.facing = 'left';
    // Keep rear head higher in frame so Edit doesn't crop the partner.
    rear.head = point(rear.head.x, Math.min(rear.head.y, 0.22));
    rear.neck = point(rear.neck.x, Math.min(rear.neck.y, 0.3));
    return pairOrTrio([bent, rear]);
  }

  if (layout === 'facesit') {
    // Lead sits; partner lies under (black stick = Image 1).
    const bottom = lyingFigure(seed, { cx: 0.48, cy: 0.6, facing: 1, salt: 40 });
    const top = uprightFigure(seed, {
      cx: 0.42,
      base: 'kneel',
      salt: 2,
      arms: 'down',
      lean: 0.05,
    });
    top.pelvis = point(0.4, 0.42);
    top.lHip = point(0.36, 0.42);
    top.rHip = point(0.44, 0.42);
    top.lKnee = point(0.34, 0.58);
    top.rKnee = point(0.46, 0.58);
    top.lAnkle = point(0.32, 0.72);
    top.rAnkle = point(0.48, 0.72);
    return pairOrTrio([top, bottom]);
  }

  if (layout === 'oral') {
    // Both kneeling: receiver upright on knees (optionally elevated on a bench);
    // giver kneeling lower BESIDE toward pelvis — never behind bent-over.
    const scene = intent.sceneText || '';
    const onBench = /\b(piano\s+bench|piano\s+stool|bench)\b/i.test(scene);
    const receiver = uprightFigure(seed, {
      cx: 0.58,
      base: 'kneel',
      salt: 1,
      arms: 'hold',
      lean: -0.08,
    });
    if (onBench) {
      // Knees up on cushion height; torso stays upright (not draped over a lid).
      receiver.head = point(0.58, 0.22);
      receiver.neck = point(0.58, 0.28);
      receiver.pelvis = point(0.58, 0.48);
      receiver.lHip = point(0.52, 0.48);
      receiver.rHip = point(0.64, 0.48);
      receiver.lKnee = point(0.5, 0.58);
      receiver.rKnee = point(0.66, 0.58);
      receiver.lAnkle = point(0.48, 0.7);
      receiver.rAnkle = point(0.68, 0.7);
    } else {
      receiver.lKnee = point(0.52, 0.72);
      receiver.rKnee = point(0.64, 0.72);
      receiver.lAnkle = point(0.5, 0.88);
      receiver.rAnkle = point(0.66, 0.88);
    }
    const giver = uprightFigure(seed, {
      cx: 0.36,
      base: 'kneel',
      salt: 2,
      arms: 'forward',
      lean: 0.4,
    });
    giver.head = point(onBench ? 0.5 : 0.48, onBench ? 0.42 : 0.5);
    giver.neck = point(onBench ? 0.48 : 0.46, onBench ? 0.48 : 0.56);
    giver.pelvis = point(0.34, onBench ? 0.72 : 0.7);
    giver.lKnee = point(0.28, onBench ? 0.8 : 0.78);
    giver.rKnee = point(0.38, onBench ? 0.8 : 0.78);
    giver.lAnkle = point(0.26, onBench ? 0.92 : 0.9);
    giver.rAnkle = point(0.4, onBench ? 0.92 : 0.9);
    // Wrists on outer thighs — never near the giver's own mouth (Edit reads that as hand-in-mouth).
    const thighY = receiver.pelvis.y + 0.06;
    giver.lWrist = point(receiver.lHip.x - 0.05, thighY);
    giver.rWrist = point(receiver.rHip.x + 0.05, thighY);
    giver.lElbow = point(
      (giver.lShoulder.x + giver.lWrist.x) / 2,
      (giver.lShoulder.y + giver.lWrist.y) / 2
    );
    giver.rElbow = point(
      (giver.rShoulder.x + giver.rWrist.x) / 2,
      (giver.rShoulder.y + giver.rWrist.y) / 2
    );
    giver.facing = 'right';
    return pairOrTrio([receiver, giver]);
  }

  if (layout === 'kneeling') {
    const left = uprightFigure(seed, {
      cx: 0.4,
      base: 'kneel',
      salt: 1,
      arms: 'hold',
      lean: 0.2,
    });
    const right = uprightFigure(seed, {
      cx: 0.58,
      base: 'kneel',
      salt: 2,
      arms: 'hold',
      lean: -0.2,
    });
    return pairOrTrio([left, right]);
  }

  if (layout === 'lap') {
    const seat = uprightFigure(seed, {
      cx: 0.48,
      base: 'sit',
      salt: 1,
      arms: 'hold',
      lean: 0,
    });
    const lap = uprightFigure(seed, {
      cx: 0.52,
      base: 'sit',
      salt: 2,
      arms: 'hold',
      lean: -0.05,
    });
    lap.pelvis = point(0.52, 0.5);
    lap.lHip = point(0.48, 0.5);
    lap.rHip = point(0.56, 0.5);
    lap.lKnee = point(0.44, 0.66);
    lap.rKnee = point(0.6, 0.66);
    lap.lAnkle = point(0.42, 0.82);
    lap.rAnkle = point(0.62, 0.82);
    seat.lKnee = point(0.4, 0.72);
    seat.rKnee = point(0.56, 0.72);
    return pairOrTrio([seat, lap]);
  }

  if (layout === 'wall') {
    // Hard-coded full-height standing wall press — uprightFigure reads too soft/crouched
    // and face-close heads were getting interpreted as a floor kneel kiss.
    return pairOrTrio(wallPressStandingFigures());
  }

  if (layout === 'lift') {
    const scene = intent.sceneText || '';
    if (/\b(chaise|daybed|fainting\s+couch)\b/i.test(scene)) {
      return pairOrTrio(chaiseLowerFigures());
    }
    const carrier = uprightFigure(seed, {
      cx: 0.48,
      base: 'stand',
      salt: 1,
      arms: 'hold',
      lean: 0.05,
    });
    const lifted = uprightFigure(seed, {
      cx: 0.52,
      base: 'stand',
      salt: 2,
      arms: 'hold',
      lean: -0.1,
    });
    // Elevate and wrap legs around carrier; arms around his neck.
    lifted.head = point(0.54, 0.1);
    lifted.neck = point(0.53, 0.18);
    lifted.pelvis = point(0.52, 0.4);
    lifted.lHip = point(0.48, 0.4);
    lifted.rHip = point(0.56, 0.4);
    lifted.lKnee = point(0.42, 0.48);
    lifted.rKnee = point(0.62, 0.48);
    lifted.lAnkle = point(0.4, 0.38);
    lifted.rAnkle = point(0.64, 0.38);
    lifted.lWrist = point(0.5, 0.14);
    lifted.rWrist = point(0.56, 0.14);
    lifted.lElbow = point(0.48, 0.22);
    lifted.rElbow = point(0.58, 0.22);
    // Carrier: hip grip + clit/hand at her front pelvis — not parked on chair arms.
    carrier.lWrist = point(0.5, 0.44);
    carrier.rWrist = point(0.54, 0.36);
    carrier.lElbow = point(0.46, 0.36);
    carrier.rElbow = point(0.54, 0.3);
    // Lead is the lifted body (black / Image 1) when the beat lifts the named character.
    return pairOrTrio([lifted, carrier]);
  }

  if (layout === 'standing') {
    const left = uprightFigure(seed, {
      cx: 0.4,
      base: 'stand',
      salt: 1,
      arms: 'hold',
      lean: 0.2,
    });
    const right = uprightFigure(seed, {
      cx: 0.58,
      base: 'stand',
      salt: 2,
      arms: 'hold',
      lean: -0.2,
    });
    return pairOrTrio([left, right]);
  }

  if (layout === 'undress') {
    const a = uprightFigure(seed, {
      cx: 0.4,
      base: 'stand',
      salt: 1,
      arms: 'up',
      lean: 0.15,
    });
    if (intent.people <= 1) {
      return [a];
    }
    const b = uprightFigure(seed, {
      cx: 0.58,
      base: 'stand',
      salt: 2,
      arms: 'forward',
      lean: -0.15,
    });
    return pairOrTrio([a, b]);
  }

  // generic intimate — close facing pair (or trio cluster)
  if (intent.base === 'lie') {
    return pairOrTrio([
      lyingFigure(seed, { cx: 0.4, cy: 0.5, facing: 1, salt: 40 }),
      lyingFigure(seed, { cx: 0.58, cy: 0.48, facing: -1, salt: 80 }),
    ]);
  }
  const a = uprightFigure(seed, {
    cx: 0.38,
    base: intent.base === 'sit' ? 'sit' : 'stand',
    salt: 1,
    arms: 'hold',
    lean: 0.2,
  });
  const b = uprightFigure(seed, {
    cx: 0.58,
    base: intent.base === 'sit' ? 'sit' : 'stand',
    salt: 2,
    arms: 'hold',
    lean: -0.2,
  });
  return pairOrTrio([a, b]);
}

/**
 * Solo mid-action athletic silhouettes for Day Sport Image 3.
 * Joints are exaggerated so Edit reads sprint / swing / kick — not a standing pin-up.
 */
function synthesizeSportStickFigure(layout: SocialLayout, seed: number): StickSkeleton {
  switch (layout) {
    case 'sport_sprint': {
      const fig = uprightFigure(seed, {
        cx: 0.48,
        base: 'run',
        salt: 1,
        arms: 'forward',
        lean: 0.28,
      });
      fig.head = point(0.56, 0.12);
      fig.neck = point(0.52, 0.2);
      fig.lShoulder = point(0.4, 0.26);
      fig.rShoulder = point(0.58, 0.24);
      fig.lElbow = point(0.62, 0.3);
      fig.lWrist = point(0.7, 0.28);
      fig.rElbow = point(0.36, 0.36);
      fig.rWrist = point(0.3, 0.42);
      fig.pelvis = point(0.46, 0.48);
      fig.lHip = point(0.42, 0.48);
      fig.rHip = point(0.5, 0.48);
      fig.lKnee = point(0.34, 0.6);
      fig.rKnee = point(0.62, 0.58);
      fig.lAnkle = point(0.22, 0.84);
      fig.rAnkle = point(0.74, 0.8);
      return fig;
    }
    case 'sport_yoga_warrior': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'stand',
        salt: 2,
        arms: 'out',
        lean: 0,
      });
      fig.lAnkle = point(0.22, 0.88);
      fig.rAnkle = point(0.78, 0.88);
      fig.lKnee = point(0.3, 0.68);
      fig.rKnee = point(0.7, 0.66);
      fig.lElbow = point(0.22, 0.34);
      fig.lWrist = point(0.1, 0.34);
      fig.rElbow = point(0.78, 0.34);
      fig.rWrist = point(0.9, 0.34);
      return fig;
    }
    case 'sport_yoga_dog': {
      // Inverted-V: hips high, hands and feet planted.
      return {
        head: point(0.28, 0.58),
        neck: point(0.32, 0.52),
        pelvis: point(0.55, 0.28),
        lShoulder: point(0.34, 0.48),
        rShoulder: point(0.38, 0.5),
        lElbow: point(0.28, 0.62),
        rElbow: point(0.32, 0.64),
        lWrist: point(0.22, 0.82),
        rWrist: point(0.28, 0.84),
        lHip: point(0.52, 0.3),
        rHip: point(0.58, 0.3),
        lKnee: point(0.62, 0.52),
        rKnee: point(0.68, 0.54),
        lAnkle: point(0.7, 0.86),
        rAnkle: point(0.78, 0.86),
      };
    }
    case 'sport_cycle': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'sit',
        salt: 3,
        arms: 'forward',
        lean: 0.35,
      });
      fig.head = point(0.62, 0.18);
      fig.neck = point(0.56, 0.26);
      fig.pelvis = point(0.42, 0.52);
      fig.lShoulder = point(0.48, 0.3);
      fig.rShoulder = point(0.58, 0.32);
      fig.lElbow = point(0.62, 0.4);
      fig.rElbow = point(0.68, 0.42);
      fig.lWrist = point(0.72, 0.48);
      fig.rWrist = point(0.76, 0.5);
      fig.lKnee = point(0.36, 0.68);
      fig.rKnee = point(0.52, 0.7);
      fig.lAnkle = point(0.28, 0.86);
      fig.rAnkle = point(0.58, 0.88);
      return fig;
    }
    case 'sport_swing': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'walk',
        salt: 4,
        arms: 'out',
        lean: -0.15,
      });
      fig.lAnkle = point(0.38, 0.88);
      fig.rAnkle = point(0.62, 0.86);
      fig.lKnee = point(0.42, 0.66);
      fig.rKnee = point(0.58, 0.64);
      // Follow-through: arms across body high → low.
      fig.lElbow = point(0.58, 0.28);
      fig.lWrist = point(0.78, 0.22);
      fig.rElbow = point(0.52, 0.4);
      fig.rWrist = point(0.68, 0.48);
      return fig;
    }
    case 'sport_serve': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'reach',
        salt: 5,
        arms: 'up',
        lean: -0.08,
      });
      fig.lAnkle = point(0.4, 0.88);
      fig.rAnkle = point(0.6, 0.86);
      fig.lKnee = point(0.42, 0.7);
      fig.rKnee = point(0.58, 0.62);
      fig.rElbow = point(0.62, 0.18);
      fig.rWrist = point(0.64, 0.06);
      fig.lElbow = point(0.36, 0.36);
      fig.lWrist = point(0.32, 0.48);
      return fig;
    }
    case 'sport_forehand': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'walk',
        salt: 6,
        arms: 'out',
        lean: 0.2,
      });
      fig.lAnkle = point(0.32, 0.86);
      fig.rAnkle = point(0.64, 0.88);
      fig.lKnee = point(0.36, 0.64);
      fig.rKnee = point(0.58, 0.68);
      fig.rElbow = point(0.72, 0.32);
      fig.rWrist = point(0.88, 0.28);
      fig.lElbow = point(0.4, 0.4);
      fig.lWrist = point(0.36, 0.52);
      return fig;
    }
    case 'sport_jump_shot': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'jump',
        salt: 7,
        arms: 'up',
        lean: -0.05,
      });
      fig.pelvis = point(0.5, 0.42);
      fig.lAnkle = point(0.42, 0.72);
      fig.rAnkle = point(0.58, 0.7);
      fig.lKnee = point(0.44, 0.56);
      fig.rKnee = point(0.56, 0.54);
      fig.rElbow = point(0.58, 0.16);
      fig.rWrist = point(0.6, 0.04);
      fig.lElbow = point(0.42, 0.22);
      fig.lWrist = point(0.44, 0.12);
      return fig;
    }
    case 'sport_kick': {
      const fig = uprightFigure(seed, {
        cx: 0.42,
        base: 'run',
        salt: 8,
        arms: 'out',
        lean: -0.18,
      });
      // Support leg planted; kicking leg locked nearly horizontal — never a yoga-tree tuck.
      fig.lHip = point(0.36, 0.48);
      fig.lKnee = point(0.34, 0.7);
      fig.lAnkle = point(0.32, 0.92);
      fig.rHip = point(0.48, 0.46);
      fig.rKnee = point(0.78, 0.4);
      fig.rAnkle = point(0.98, 0.32);
      // Arms flung wide for balance — not resting on the bent knee.
      fig.lElbow = point(0.14, 0.28);
      fig.lWrist = point(0.02, 0.22);
      fig.rElbow = point(0.72, 0.22);
      fig.rWrist = point(0.9, 0.16);
      return fig;
    }
    case 'sport_throw': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'reach',
        salt: 9,
        arms: 'up',
        lean: 0.22,
      });
      fig.lAnkle = point(0.34, 0.88);
      fig.rAnkle = point(0.62, 0.84);
      fig.lKnee = point(0.38, 0.66);
      fig.rKnee = point(0.56, 0.6);
      fig.rElbow = point(0.7, 0.2);
      fig.rWrist = point(0.84, 0.1);
      fig.lElbow = point(0.36, 0.4);
      fig.lWrist = point(0.28, 0.5);
      return fig;
    }
    case 'sport_lunge': {
      const fig = uprightFigure(seed, {
        cx: 0.48,
        base: 'run',
        salt: 10,
        arms: 'forward',
        lean: 0.3,
      });
      fig.lAnkle = point(0.28, 0.88);
      fig.rAnkle = point(0.72, 0.86);
      fig.lKnee = point(0.34, 0.62);
      fig.rKnee = point(0.64, 0.7);
      // Blade arm extended long.
      fig.rElbow = point(0.7, 0.32);
      fig.rWrist = point(0.92, 0.3);
      fig.lElbow = point(0.36, 0.36);
      fig.lWrist = point(0.3, 0.28);
      return fig;
    }
    case 'sport_handstand': {
      // Vertical inversion: hands down, feet up.
      return {
        head: point(0.5, 0.72),
        neck: point(0.5, 0.64),
        pelvis: point(0.5, 0.32),
        lShoulder: point(0.42, 0.58),
        rShoulder: point(0.58, 0.58),
        lElbow: point(0.4, 0.72),
        rElbow: point(0.6, 0.72),
        lWrist: point(0.38, 0.88),
        rWrist: point(0.62, 0.88),
        lHip: point(0.46, 0.34),
        rHip: point(0.54, 0.34),
        lKnee: point(0.44, 0.18),
        rKnee: point(0.56, 0.18),
        lAnkle: point(0.42, 0.06),
        rAnkle: point(0.58, 0.06),
      };
    }
    case 'sport_pitch': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'walk',
        salt: 11,
        arms: 'up',
        lean: 0.18,
      });
      fig.lAnkle = point(0.4, 0.88);
      fig.rAnkle = point(0.58, 0.7);
      fig.rKnee = point(0.6, 0.48);
      fig.lKnee = point(0.42, 0.66);
      fig.rElbow = point(0.62, 0.2);
      fig.rWrist = point(0.66, 0.08);
      fig.lElbow = point(0.34, 0.42);
      fig.lWrist = point(0.28, 0.52);
      return fig;
    }
    case 'sport_stick': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'walk',
        salt: 12,
        arms: 'hold',
        lean: 0.15,
      });
      fig.lAnkle = point(0.36, 0.88);
      fig.rAnkle = point(0.64, 0.86);
      fig.lKnee = point(0.4, 0.68);
      fig.rKnee = point(0.6, 0.66);
      fig.lElbow = point(0.42, 0.4);
      fig.lWrist = point(0.48, 0.52);
      fig.rElbow = point(0.6, 0.38);
      fig.rWrist = point(0.7, 0.55);
      return fig;
    }
    case 'sport_block': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'walk',
        salt: 13,
        arms: 'forward',
        lean: -0.1,
      });
      fig.lAnkle = point(0.34, 0.88);
      fig.rAnkle = point(0.66, 0.88);
      fig.lKnee = point(0.38, 0.66);
      fig.rKnee = point(0.62, 0.66);
      fig.lElbow = point(0.36, 0.34);
      fig.lWrist = point(0.32, 0.26);
      fig.rElbow = point(0.58, 0.36);
      fig.rWrist = point(0.54, 0.28);
      return fig;
    }
    case 'sport_hurdle': {
      const fig = uprightFigure(seed, {
        cx: 0.48,
        base: 'run',
        salt: 14,
        arms: 'forward',
        lean: 0.22,
      });
      fig.lAnkle = point(0.28, 0.88);
      fig.lKnee = point(0.34, 0.66);
      // Lead leg high over the bar.
      fig.rHip = point(0.52, 0.44);
      fig.rKnee = point(0.7, 0.36);
      fig.rAnkle = point(0.86, 0.28);
      fig.lElbow = point(0.58, 0.3);
      fig.lWrist = point(0.68, 0.24);
      fig.rElbow = point(0.34, 0.38);
      fig.rWrist = point(0.28, 0.46);
      return fig;
    }
    case 'sport_slide': {
      // Low sideways slide — torso near ground, lead leg extended.
      return {
        head: point(0.62, 0.42),
        neck: point(0.56, 0.48),
        pelvis: point(0.4, 0.62),
        lShoulder: point(0.5, 0.5),
        rShoulder: point(0.58, 0.52),
        lElbow: point(0.42, 0.6),
        rElbow: point(0.64, 0.58),
        lWrist: point(0.36, 0.72),
        rWrist: point(0.72, 0.62),
        lHip: point(0.38, 0.62),
        rHip: point(0.44, 0.62),
        lKnee: point(0.28, 0.72),
        rKnee: point(0.62, 0.7),
        lAnkle: point(0.18, 0.86),
        rAnkle: point(0.84, 0.78),
      };
    }
    case 'sport_dunk': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'jump',
        salt: 15,
        arms: 'up',
        lean: -0.08,
      });
      fig.pelvis = point(0.5, 0.38);
      fig.lAnkle = point(0.44, 0.68);
      fig.rAnkle = point(0.56, 0.66);
      fig.lKnee = point(0.46, 0.52);
      fig.rKnee = point(0.54, 0.5);
      // Both arms fully overhead at the rim.
      fig.lElbow = point(0.44, 0.12);
      fig.lWrist = point(0.46, 0.02);
      fig.rElbow = point(0.56, 0.12);
      fig.rWrist = point(0.58, 0.02);
      return fig;
    }
    case 'sport_ski': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'walk',
        salt: 16,
        arms: 'out',
        lean: 0.35,
      });
      fig.lAnkle = point(0.3, 0.88);
      fig.rAnkle = point(0.58, 0.86);
      fig.lKnee = point(0.36, 0.68);
      fig.rKnee = point(0.52, 0.64);
      fig.pelvis = point(0.44, 0.5);
      fig.lElbow = point(0.32, 0.4);
      fig.lWrist = point(0.22, 0.52);
      fig.rElbow = point(0.62, 0.36);
      fig.rWrist = point(0.74, 0.44);
      return fig;
    }
    case 'sport_putt': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'crouch',
        salt: 17,
        arms: 'hold',
        lean: 0.12,
      });
      fig.lAnkle = point(0.4, 0.88);
      fig.rAnkle = point(0.6, 0.88);
      fig.lKnee = point(0.42, 0.7);
      fig.rKnee = point(0.58, 0.7);
      fig.pelvis = point(0.5, 0.56);
      fig.lElbow = point(0.44, 0.48);
      fig.lWrist = point(0.46, 0.58);
      fig.rElbow = point(0.56, 0.48);
      fig.rWrist = point(0.54, 0.58);
      return fig;
    }
    case 'sport_overhead': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'reach',
        salt: 18,
        arms: 'up',
        lean: -0.15,
      });
      fig.lAnkle = point(0.38, 0.88);
      fig.rAnkle = point(0.62, 0.86);
      fig.lKnee = point(0.4, 0.68);
      fig.rKnee = point(0.58, 0.64);
      fig.rElbow = point(0.58, 0.14);
      fig.rWrist = point(0.6, 0.02);
      fig.lElbow = point(0.36, 0.28);
      fig.lWrist = point(0.3, 0.2);
      return fig;
    }
    case 'sport_swim': {
      // Horizontal freestyle: head low, leading arm extended, trail arm recovering.
      return {
        head: point(0.72, 0.36),
        neck: point(0.66, 0.4),
        pelvis: point(0.38, 0.48),
        lShoulder: point(0.58, 0.38),
        rShoulder: point(0.62, 0.42),
        lElbow: point(0.78, 0.34),
        rElbow: point(0.48, 0.28),
        lWrist: point(0.9, 0.36),
        rWrist: point(0.4, 0.18),
        lHip: point(0.36, 0.46),
        rHip: point(0.4, 0.5),
        lKnee: point(0.28, 0.52),
        rKnee: point(0.24, 0.58),
        lAnkle: point(0.16, 0.5),
        rAnkle: point(0.12, 0.62),
      };
    }
    case 'sport_spike': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'jump',
        salt: 19,
        arms: 'up',
        lean: -0.1,
      });
      fig.pelvis = point(0.5, 0.4);
      fig.lAnkle = point(0.44, 0.7);
      fig.rAnkle = point(0.56, 0.68);
      fig.lKnee = point(0.46, 0.54);
      fig.rKnee = point(0.54, 0.52);
      // Hitting arm cocked high; guide hand out front.
      fig.rElbow = point(0.62, 0.12);
      fig.rWrist = point(0.68, 0.02);
      fig.lElbow = point(0.4, 0.22);
      fig.lWrist = point(0.36, 0.14);
      return fig;
    }
    case 'sport_box': {
      const fig = uprightFigure(seed, {
        cx: 0.48,
        base: 'run',
        salt: 20,
        arms: 'forward',
        lean: 0.12,
      });
      fig.lAnkle = point(0.36, 0.88);
      fig.rAnkle = point(0.58, 0.86);
      fig.lKnee = point(0.4, 0.68);
      fig.rKnee = point(0.54, 0.66);
      // Guard up — fists near chin/cheek.
      fig.lElbow = point(0.4, 0.36);
      fig.lWrist = point(0.46, 0.28);
      fig.rElbow = point(0.58, 0.34);
      fig.rWrist = point(0.62, 0.26);
      return fig;
    }
    case 'sport_surf': {
      const fig = uprightFigure(seed, {
        cx: 0.5,
        base: 'crouch',
        salt: 21,
        arms: 'out',
        lean: 0.28,
      });
      fig.pelvis = point(0.48, 0.52);
      fig.lAnkle = point(0.34, 0.86);
      fig.rAnkle = point(0.62, 0.84);
      fig.lKnee = point(0.4, 0.66);
      fig.rKnee = point(0.56, 0.64);
      fig.lElbow = point(0.32, 0.4);
      fig.lWrist = point(0.22, 0.46);
      fig.rElbow = point(0.68, 0.38);
      fig.rWrist = point(0.8, 0.42);
      return fig;
    }
    default: {
      return uprightFigure(seed, { cx: 0.5, base: 'run', salt: 1, arms: 'forward', lean: 0.2 });
    }
  }
}

/** Dedicated non-intimate social/action layouts — wireframe silhouettes only. */
export function synthesizeSocialStickFigures(intent: PoseGuideIntent): StickSkeleton[] {
  const layout = intent.social ?? 'hug';
  const seed = intent.seed;
  if (isSportSocialLayout(layout)) {
    return [synthesizeSportStickFigure(layout, seed)];
  }
  const wantTrio = intent.people >= 3;
  const pairOrTrio = (pair: StickSkeleton[]) =>
    wantTrio
      ? [...pair, uprightFigure(seed, { cx: 0.82, base: 'stand', salt: 3, lean: -0.1 })]
      : pair;

  if (layout === 'climb') {
    // Nuclear climb — one foot up on a step, both hands high on rail.
    if (intent.people <= 1) {
      return [
        {
          head: point(0.5, 0.08),
          neck: point(0.48, 0.16),
          pelvis: point(0.46, 0.48),
          lShoulder: point(0.34, 0.2),
          rShoulder: point(0.62, 0.18),
          lElbow: point(0.3, 0.12),
          rElbow: point(0.68, 0.1),
          lWrist: point(0.28, 0.04),
          rWrist: point(0.72, 0.04),
          lHip: point(0.4, 0.48),
          rHip: point(0.54, 0.48),
          lKnee: point(0.42, 0.58),
          rKnee: point(0.6, 0.7),
          lAnkle: point(0.4, 0.68),
          rAnkle: point(0.62, 0.9),
        },
      ];
    }
    const climber = uprightFigure(seed, {
      cx: 0.5,
      base: 'reach',
      salt: 1,
      arms: 'up',
      lean: 0.08,
    });
    climber.lWrist = point(0.42, 0.14);
    climber.rWrist = point(0.58, 0.1);
    climber.lElbow = point(0.4, 0.26);
    climber.rElbow = point(0.56, 0.22);
    climber.lKnee = point(0.44, 0.58);
    climber.rKnee = point(0.58, 0.62);
    climber.lAnkle = point(0.42, 0.72);
    climber.rAnkle = point(0.6, 0.86);
    return pairOrTrio([
      climber,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'up', lean: -0.1 }),
    ]);
  }

  if (layout === 'phone') {
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 1,
      arms: 'forward',
      lean: -0.08,
    });
    // Phone hand raised toward face.
    figure.rElbow = point(0.58, 0.34);
    figure.rWrist = point(0.56, 0.26);
    figure.lElbow = point(0.4, 0.42);
    figure.lWrist = point(0.38, 0.52);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.7, base: 'stand', salt: 2, arms: 'down', lean: -0.05 }),
    ]);
  }

  if (layout === 'look_back') {
    const scene = intent.sceneText || '';
    const zipping = /\b(zip|unzip|twist(?:ing)?)\b/i.test(scene);
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 1,
      arms: zipping ? 'up' : 'hold',
      lean: 0.32,
    });
    // Twist: head toward camera over near shoulder; torso angled away from square-on.
    figure.head = point(0.4, 0.11);
    figure.neck = point(0.46, 0.2);
    figure.pelvis = point(0.54, 0.5);
    figure.lHip = point(0.48, 0.5);
    figure.rHip = point(0.58, 0.48);
    figure.lShoulder = point(0.36, 0.26);
    figure.rShoulder = point(0.58, 0.22);
    figure.lKnee = point(0.44, 0.66);
    figure.rKnee = point(0.6, 0.64);
    figure.lAnkle = point(0.4, 0.86);
    figure.rAnkle = point(0.66, 0.84);
    if (zipping) {
      // Both hands at mid-back zipper — not arms hanging at sides.
      figure.lElbow = point(0.42, 0.34);
      figure.rElbow = point(0.54, 0.32);
      figure.lWrist = point(0.46, 0.4);
      figure.rWrist = point(0.52, 0.38);
    } else {
      figure.lElbow = point(0.34, 0.38);
      figure.rElbow = point(0.62, 0.36);
      figure.lWrist = point(0.36, 0.48);
      figure.rWrist = point(0.6, 0.44);
    }
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'down', lean: -0.1 }),
    ]);
  }

  if (layout === 'stretch') {
    // Nuclear stretch — both wrists overhead + clear weight shift (narrow ankles read as stand).
    if (intent.people <= 1) {
      return [
        {
          head: point(0.5, 0.08),
          neck: point(0.48, 0.16),
          pelvis: point(0.46, 0.5),
          lShoulder: point(0.34, 0.2),
          rShoulder: point(0.62, 0.18),
          lElbow: point(0.26, 0.08),
          rElbow: point(0.72, 0.06),
          lWrist: point(0.22, 0.02),
          rWrist: point(0.78, 0.02),
          lHip: point(0.38, 0.5),
          rHip: point(0.54, 0.48),
          lKnee: point(0.3, 0.7),
          rKnee: point(0.64, 0.62),
          lAnkle: point(0.24, 0.9),
          rAnkle: point(0.72, 0.78),
        },
      ];
    }
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: 'reach',
      salt: 1,
      arms: 'up',
      lean: -0.04,
    });
    figure.lWrist = point(0.4, 0.08);
    figure.rWrist = point(0.6, 0.06);
    figure.lElbow = point(0.38, 0.2);
    figure.rElbow = point(0.62, 0.18);
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'down', lean: -0.08 }),
    ]);
  }

  if (layout === 'wave') {
    // Nuclear solo wave — mild arm-raise on a stand still reads as Keep fashion plate.
    // High overhead wave + stepped weight + torso twist so Edit cannot freeze arms-at-sides.
    if (intent.people <= 1) {
      const seatedWave = /\b(seated|sit(?:ting)?|perch(?:ed)?|rail\s+ledge|hip\s+against)\b/i.test(
        intent.sceneText || ''
      );
      if (seatedWave) {
        return [
          {
            head: point(0.52, 0.28),
            neck: point(0.5, 0.36),
            pelvis: point(0.48, 0.7),
            lShoulder: point(0.38, 0.38),
            rShoulder: point(0.62, 0.36),
            lElbow: point(0.34, 0.5),
            rElbow: point(0.72, 0.18),
            lWrist: point(0.4, 0.6),
            rWrist: point(0.8, 0.04),
            lHip: point(0.42, 0.7),
            rHip: point(0.54, 0.7),
            lKnee: point(0.4, 0.82),
            rKnee: point(0.66, 0.78),
            lAnkle: point(0.38, 0.92),
            rAnkle: point(0.72, 0.9),
          },
        ];
      }
      return [
        {
          head: point(0.5, 0.1),
          neck: point(0.48, 0.18),
          pelvis: point(0.46, 0.5),
          lShoulder: point(0.34, 0.22),
          rShoulder: point(0.62, 0.2),
          lElbow: point(0.28, 0.4),
          rElbow: point(0.74, 0.08),
          lWrist: point(0.32, 0.54),
          rWrist: point(0.82, 0.02),
          lHip: point(0.4, 0.5),
          rHip: point(0.54, 0.5),
          lKnee: point(0.34, 0.7),
          rKnee: point(0.64, 0.62),
          lAnkle: point(0.28, 0.9),
          rAnkle: point(0.72, 0.78),
        },
      ];
    }
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 1,
      arms: 'up',
      lean: 0.06,
    });
    figure.rElbow = point(0.66, 0.22);
    figure.rWrist = point(0.72, 0.1);
    figure.lElbow = point(0.4, 0.4);
    figure.lWrist = point(0.38, 0.52);
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'down', lean: -0.08 }),
    ]);
  }

  if (layout === 'cross_arms') {
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 1,
      arms: 'crossed',
      lean: 0.04,
    });
    figure.lElbow = point(0.42, 0.36);
    figure.rElbow = point(0.58, 0.36);
    figure.lWrist = point(0.56, 0.4);
    figure.rWrist = point(0.44, 0.4);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'down', lean: -0.08 }),
    ]);
  }

  if (layout === 'pockets') {
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 1,
      arms: 'hold',
      lean: 0.12,
    });
    figure.lElbow = point(0.4, 0.4);
    figure.rElbow = point(0.6, 0.4);
    figure.lWrist = point(0.44, 0.5);
    figure.rWrist = point(0.56, 0.5);
    figure.rAnkle = point(0.62, 0.86);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'down', lean: -0.08 }),
    ]);
  }

  if (layout === 'drink') {
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 1,
      arms: 'hold',
      lean: -0.06,
    });
    // Mug / glass raised toward face.
    figure.rElbow = point(0.6, 0.34);
    figure.rWrist = point(0.56, 0.24);
    figure.lElbow = point(0.4, 0.42);
    figure.lWrist = point(0.38, 0.52);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'down', lean: -0.08 }),
    ]);
  }

  if (layout === 'carry') {
    const figure = uprightFigure(seed, {
      cx: 0.48,
      base: 'walk',
      salt: 1,
      arms: 'hold',
      lean: 0.1,
    });
    // Bag on one side / shoulder strap pull.
    figure.lElbow = point(0.34, 0.4);
    figure.lWrist = point(0.32, 0.54);
    figure.rElbow = point(0.62, 0.36);
    figure.rWrist = point(0.66, 0.48);
    figure.lAnkle = point(0.34, 0.86);
    figure.rAnkle = point(0.6, 0.84);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.74, base: 'stand', salt: 2, arms: 'down', lean: -0.08 }),
    ]);
  }

  if (layout === 'read') {
    const seated = /\b(sit|seated|bench|couch|chair|booth)\b/i.test(intent.sceneText || '');
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: seated ? 'sit' : 'stand',
      salt: 1,
      arms: 'hold',
      lean: 0.08,
    });
    // Head down toward book/page in hands.
    figure.head = point(0.48, seated ? 0.26 : 0.16);
    figure.neck = point(0.49, seated ? 0.34 : 0.24);
    figure.lElbow = point(0.4, seated ? 0.48 : 0.4);
    figure.rElbow = point(0.6, seated ? 0.48 : 0.4);
    figure.lWrist = point(0.46, seated ? 0.54 : 0.46);
    figure.rWrist = point(0.54, seated ? 0.54 : 0.46);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'down', lean: -0.08 }),
    ]);
  }

  if (layout === 'rail') {
    const figure = uprightFigure(seed, {
      cx: 0.48,
      base: 'lean',
      salt: 1,
      arms: 'forward',
      lean: 0.18,
    });
    figure.lElbow = point(0.36, 0.36);
    figure.rElbow = point(0.58, 0.34);
    figure.lWrist = point(0.28, 0.4);
    figure.rWrist = point(0.7, 0.38);
    figure.rAnkle = point(0.58, 0.86);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.74, base: 'stand', salt: 2, arms: 'down', lean: -0.1 }),
    ]);
  }

  if (layout === 'point') {
    const figure = uprightFigure(seed, {
      cx: 0.48,
      base: 'stand',
      salt: 1,
      arms: 'forward',
      lean: 0.1,
    });
    figure.rElbow = point(0.62, 0.32);
    figure.rWrist = point(0.74, 0.26);
    figure.lElbow = point(0.4, 0.42);
    figure.lWrist = point(0.38, 0.52);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.74, base: 'stand', salt: 2, arms: 'down', lean: -0.08 }),
    ]);
  }

  if (layout === 'hug') {
    const left = uprightFigure(seed, {
      cx: 0.44,
      base: 'stand',
      salt: 1,
      arms: 'hold',
      lean: 0.22,
    });
    const right = uprightFigure(seed, {
      cx: 0.56,
      base: 'stand',
      salt: 2,
      arms: 'hold',
      lean: -0.22,
    });
    // Arms wrap toward partner midsection.
    left.rElbow = point(0.5, 0.36);
    left.rWrist = point(0.56, 0.4);
    left.lElbow = point(0.42, 0.4);
    left.lWrist = point(0.5, 0.44);
    right.lElbow = point(0.5, 0.36);
    right.lWrist = point(0.44, 0.4);
    right.rElbow = point(0.58, 0.4);
    right.rWrist = point(0.5, 0.44);
    return pairOrTrio([left, right]);
  }

  if (layout === 'dance') {
    // Solo suggestive/vacation "dancing alone" must NOT draw a ballroom pair —
    // a second stick figure fights SOLO LOCK and Edit collapses to the Keep stand.
    if (intent.people <= 1) {
      // Nuclear solo dance — both arms overhead + one knee lifted mid-step.
      // Gravity-defying kicks (ankle above hip) make Qwen Edit abandon Image 3 and
      // freeze the Outfit Keep fashion stand; keep the lift readable but human.
      return [
        {
          head: point(0.5, 0.08),
          neck: point(0.48, 0.16),
          pelvis: point(0.44, 0.5),
          lShoulder: point(0.34, 0.2),
          rShoulder: point(0.62, 0.18),
          lElbow: point(0.26, 0.08),
          rElbow: point(0.72, 0.06),
          lWrist: point(0.22, 0.02),
          rWrist: point(0.78, 0.02),
          lHip: point(0.38, 0.5),
          rHip: point(0.52, 0.48),
          // Planted support leg + opposite knee lifted to mid-thigh (not above hip).
          lKnee: point(0.3, 0.72),
          rKnee: point(0.66, 0.4),
          lAnkle: point(0.26, 0.92),
          rAnkle: point(0.7, 0.52),
        },
      ];
    }
    const lead = uprightFigure(seed, {
      cx: 0.42,
      base: 'walk',
      salt: 1,
      arms: 'out',
      lean: 0.15,
    });
    const follow = uprightFigure(seed, {
      cx: 0.58,
      base: 'walk',
      salt: 2,
      arms: 'hold',
      lean: -0.15,
    });
    // Ballroom frame: one arm out, one joined at mid.
    lead.lElbow = point(0.3, 0.34);
    lead.lWrist = point(0.22, 0.3);
    lead.rElbow = point(0.5, 0.36);
    lead.rWrist = point(0.54, 0.4);
    follow.rElbow = point(0.7, 0.34);
    follow.rWrist = point(0.78, 0.3);
    follow.lElbow = point(0.52, 0.36);
    follow.lWrist = point(0.48, 0.4);
    // Stagger feet for motion.
    lead.lAnkle = point(0.36, 0.86);
    lead.rAnkle = point(0.48, 0.84);
    follow.lAnkle = point(0.54, 0.84);
    follow.rAnkle = point(0.66, 0.86);
    return pairOrTrio([lead, follow]);
  }

  // fight / spar — opposed wide stance
  const left = uprightFigure(seed, {
    cx: 0.36,
    base: 'walk',
    salt: 1,
    arms: 'forward',
    lean: 0.25,
  });
  const right = uprightFigure(seed, {
    cx: 0.64,
    base: 'walk',
    salt: 2,
    arms: 'forward',
    lean: -0.25,
  });
  left.rElbow = point(0.46, 0.34);
  left.rWrist = point(0.52, 0.3);
  left.lElbow = point(0.3, 0.4);
  left.lWrist = point(0.28, 0.5);
  right.lElbow = point(0.54, 0.34);
  right.lWrist = point(0.48, 0.3);
  right.rElbow = point(0.7, 0.4);
  right.rWrist = point(0.72, 0.5);
  left.lAnkle = point(0.28, 0.86);
  left.rAnkle = point(0.42, 0.84);
  right.lAnkle = point(0.58, 0.84);
  right.rAnkle = point(0.72, 0.86);
  return pairOrTrio([left, right]);
}

/** Synthesize 1–3 stick figures laid out for the scene. */
export function synthesizeSceneStickFigures(
  text: string | null | undefined,
  fallbackIndex = 0,
  options?: { forcePeople?: number; clothedUprightOnly?: boolean; allowIntimate?: boolean }
): { intent: PoseGuideIntent; figures: StickSkeleton[] } {
  const intent = parsePoseGuideIntent(text, fallbackIndex, options);
  if (intent.intimate) {
    const figures = synthesizeIntimateStickFigures(intent);
    return {
      intent: {
        ...intent,
        people: figures.length,
        label: `${intent.label}-x${figures.length}`,
      },
      figures,
    };
  }
  if (intent.social) {
    const figures = synthesizeSocialStickFigures(intent);
    return {
      intent: {
        ...intent,
        people: figures.length,
        label: `${intent.label}-x${figures.length}`,
      },
      figures,
    };
  }

  const people = clamp(intent.people, 1, 3);
  const centers = people === 3 ? TRIO_CENTERS : people === 2 ? DUO_CENTERS : ([0.5] as const);
  const facePartner =
    people >= 2 &&
    /\b(kiss|argue|talk|speak|face[- ]to[- ]face|each other|knee[- ]to[- ]knee|confront)\b/i.test(
      text?.trim() || ''
    );

  const figures = centers.map((centerX, index) => {
    const personIntent: PoseGuideIntent = {
      ...intent,
      lean:
        people === 1
          ? intent.lean
          : index === 0
            ? Math.abs(intent.lean) + (facePartner ? 0.12 : -0.05)
            : index === people - 1
              ? -Math.abs(intent.lean) - (facePartner ? 0.12 : -0.05)
              : intent.lean * 0.3,
      seed: intent.seed,
      label: `${intent.label}-p${index + 1}`,
    };
    let skeleton = synthesizeStickSkeleton(personIntent, {
      centerX,
      seedSalt: index + 1,
    });
    if (facePartner && index === people - 1) {
      skeleton = mirrorStickSkeleton(skeleton, centerX);
    }
    return skeleton;
  });

  return {
    intent: {
      ...intent,
      people,
      label: people > 1 ? `${intent.label}-x${people}` : intent.label,
    },
    figures,
  };
}

function normalizePoseKey(key: string | undefined): PoseGuideKey {
  const trimmed = key?.trim().toLowerCase() || '';
  if ((POSE_KEYS as readonly string[]).includes(trimmed)) {
    return trimmed as PoseGuideKey;
  }
  if (/(^|-)(reach|wave|point|grab)$/.test(trimmed) || trimmed === 'reach') {
    return 'morning';
  }
  if (/(^|-)(walk|run|stride|jog)$/.test(trimmed) || trimmed === 'walk') {
    return 'afternoon';
  }
  if (/(^|-)(sit|seated|crouch|kneel)$/.test(trimmed) || trimmed === 'sit') {
    return 'evening';
  }
  if (/(^|-)(stand|lean|pause|wait)$/.test(trimmed) || trimmed === 'stand') {
    return 'night';
  }
  return 'afternoon';
}

/** Cycle four distinct stances across Story beats so consecutive stills don't freeze. */
export function resolveStoryPoseGuideKey(storyIndex: number): PoseGuideKey {
  const index = Number.isFinite(storyIndex) ? Math.max(0, Math.floor(storyIndex)) : 0;
  return POSE_KEYS[index % POSE_KEYS.length]!;
}

/**
 * Map scene text to a Day-slot key (compat). Prefer {@link parsePoseGuideIntent}
 * + {@link synthesizeStickSkeleton} for Story.
 */
export function resolvePoseGuideKeyFromScene(
  text: string | null | undefined,
  fallbackIndex = 0
): PoseGuideKey {
  if (!text?.trim()) {
    return resolveStoryPoseGuideKey(fallbackIndex);
  }
  const intent = parsePoseGuideIntent(text, fallbackIndex);
  if (intent.intimate) {
    return 'evening';
  }
  if (intent.social === 'climb' || intent.social === 'fight') {
    return 'morning';
  }
  if (intent.social === 'dance') {
    return 'afternoon';
  }
  if (intent.social === 'hug' || intent.social === 'phone' || intent.social === 'look_back') {
    return 'night';
  }
  // Unmatched bland copy still maps through synthesized base (stand/walk/sit/lean).
  switch (intent.base) {
    case 'sit':
    case 'crouch':
    case 'kneel':
    case 'lie':
      return 'evening';
    case 'walk':
    case 'run':
    case 'jump':
      return 'afternoon';
    case 'reach':
      return 'morning';
    case 'lean':
      return 'night';
    case 'stand':
    default:
      return intent.base === 'stand' ? 'night' : resolveStoryPoseGuideKey(fallbackIndex);
  }
}

function drawCapsule(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  radius: number,
  fill: string
): void {
  const from = px(a);
  const to = px(b);
  ctx.strokeStyle = fill;
  ctx.lineWidth = Math.max(4, radius * 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawJointBlob(
  ctx: CanvasRenderingContext2D,
  joint: Point,
  radius: number,
  fill: string
): void {
  const at = px(joint);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(at.x, at.y, Math.max(3, radius), 0, Math.PI * 2);
  ctx.fill();
}

/** Distinct schematic fills — never near-black (Edit paints black capsules as morphsuits).
 * Index 0 (magenta) is always the Cast lead — Image 1 identity maps to this figure.
 * Index 1 (cyan) / 2 (orange) are partners with different faces.
 */
const MULTI_FIGURE_PALETTE = [
  { fill: '#c026d3', stroke: '#86198f' },
  { fill: '#0891b2', stroke: '#155e75' },
  { fill: '#ea580c', stroke: '#9a3412' },
] as const;

/**
 * Rapid AIO + Edit-2511: muted gray outlines (no neon fills).
 * Filled magenta/cyan capsules leak into the finished still on these stacks
 * (Rapid glass reflections; Edit-2511 Lightning paints purple squiggles into the scene).
 */
/** Mid slate outlines on white — dark charcoal paper was copying into Lightning stills. */
const RAPID_AIO_OUTLINE_PALETTE = [
  { stroke: '#64748b', lineWidth: 4.6 },
  { stroke: '#788396', lineWidth: 4.0 },
  { stroke: '#8b95a5', lineWidth: 3.6 },
] as const;

const OUTLINE_GRAY_PAPER = '#ffffff';

export type PoseGuideVisualStyle = 'filled' | 'outline-gray' | 'openpose';

export { usesOutlineGrayPoseGuide };

/**
 * OpenPose unless Settings asks for the legacy art; legacy picks gray outlines on Rapid AIO /
 * Edit-2511 and filled capsules elsewhere.
 */
export function resolvePoseGuideVisualStyle(
  model?: string | null,
  preference?: PoseGuideStylePreference | null
): PoseGuideVisualStyle {
  if (normalizePoseGuideStylePreference(preference) === 'openpose') {
    return 'openpose';
  }
  return usesOutlineGrayPoseGuide(model) ? 'outline-gray' : 'filled';
}

/** Prompt-side style for a drawn guide (both legacy arts share the legacy cue family). */
export function poseGuideStylePreferenceFor(style: PoseGuideVisualStyle): PoseGuideStylePreference {
  return style === 'openpose' ? 'openpose' : 'legacy';
}

function drawStickLimbStroke(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  lineWidth: number,
  stroke: string
): void {
  const from = px(a);
  const to = px(b);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1.5, lineWidth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/** Draw a filled mannequin from skeleton joints — body mass, no face/clothes. */
export function drawStickSkeleton(
  ctx: CanvasRenderingContext2D,
  skeleton: StickSkeleton,
  options?: {
    clear?: boolean;
    strokeStyle?: string;
    fillStyle?: string;
    headRadius?: number;
    lineWidth?: number;
    /** Rapid AIO: outline-only gray limbs (no neon capsule fills). */
    visualStyle?: PoseGuideVisualStyle;
  }
): void {
  const visualStyle = options?.visualStyle ?? 'filled';
  if (options?.clear !== false) {
    // White paper — charcoal plates leaked as a dark color overlay on Lightning.
    ctx.fillStyle = visualStyle === 'outline-gray' ? OUTLINE_GRAY_PAPER : '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  if (visualStyle === 'outline-gray') {
    const stroke = options?.strokeStyle ?? '#9ca3af';
    const lineWidth = options?.lineWidth ?? 3;
    const headRadius = options?.headRadius ?? 22;
    const limb = (a: Point, b: Point, width = lineWidth) =>
      drawStickLimbStroke(ctx, a, b, width, stroke);
    limb(skeleton.lShoulder, skeleton.rShoulder);
    limb(skeleton.neck, skeleton.pelvis, lineWidth * 1.15);
    limb(skeleton.lHip, skeleton.rHip);
    limb(skeleton.lShoulder, skeleton.lElbow);
    limb(skeleton.lElbow, skeleton.lWrist);
    limb(skeleton.rShoulder, skeleton.rElbow);
    limb(skeleton.rElbow, skeleton.rWrist);
    limb(skeleton.lHip, skeleton.lKnee);
    limb(skeleton.lKnee, skeleton.lAnkle);
    limb(skeleton.rHip, skeleton.rKnee);
    limb(skeleton.rKnee, skeleton.rAnkle);
    limb(skeleton.head, skeleton.neck, lineWidth * 0.9);
    limb(skeleton.neck, skeleton.lShoulder, lineWidth * 0.85);
    limb(skeleton.neck, skeleton.rShoulder, lineWidth * 0.85);
    const headPx = px(skeleton.head);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1.5, lineWidth * 0.9);
    ctx.beginPath();
    ctx.arc(headPx.x, headPx.y, headRadius, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  const scale = (options?.lineWidth ?? 5) / 5;
  const r = (n: number) => Math.max(3, Math.round(n * scale));
  const fill = options?.fillStyle ?? options?.strokeStyle ?? '#c026d3';
  const outline = options?.strokeStyle ?? '#86198f';
  const headRadius = options?.headRadius ?? 30;

  // Thin outline so overlapping duo figures stay separable without blob joints.
  const outlineBoost = 1.08;
  const drawOutlineLimb = (a: Point, b: Point, radius: number) =>
    drawCapsule(ctx, a, b, radius * outlineBoost, outline);
  drawOutlineLimb(skeleton.lShoulder, skeleton.rShoulder, r(11));
  drawOutlineLimb(skeleton.neck, skeleton.pelvis, r(15));
  drawOutlineLimb(skeleton.lHip, skeleton.rHip, r(12));
  drawOutlineLimb(skeleton.lShoulder, skeleton.lElbow, r(9));
  drawOutlineLimb(skeleton.lElbow, skeleton.lWrist, r(8));
  drawOutlineLimb(skeleton.rShoulder, skeleton.rElbow, r(9));
  drawOutlineLimb(skeleton.rElbow, skeleton.rWrist, r(8));
  drawOutlineLimb(skeleton.lHip, skeleton.lKnee, r(10));
  drawOutlineLimb(skeleton.lKnee, skeleton.lAnkle, r(8));
  drawOutlineLimb(skeleton.rHip, skeleton.rKnee, r(10));
  drawOutlineLimb(skeleton.rKnee, skeleton.rAnkle, r(8));

  // Body-mass fill — tapered limbs; avoid oversized chest/hand blobs (those bleed as ball joints).
  drawCapsule(ctx, skeleton.lShoulder, skeleton.rShoulder, r(11), fill);
  drawCapsule(ctx, skeleton.neck, skeleton.pelvis, r(15), fill);
  drawCapsule(ctx, skeleton.lHip, skeleton.rHip, r(12), fill);
  drawCapsule(ctx, skeleton.pelvis, skeleton.lHip, r(9), fill);
  drawCapsule(ctx, skeleton.pelvis, skeleton.rHip, r(9), fill);
  drawCapsule(ctx, skeleton.neck, skeleton.lShoulder, r(8), fill);
  drawCapsule(ctx, skeleton.neck, skeleton.rShoulder, r(8), fill);
  drawCapsule(ctx, skeleton.head, skeleton.neck, r(7), fill);

  drawCapsule(ctx, skeleton.lShoulder, skeleton.lElbow, r(9), fill);
  drawCapsule(ctx, skeleton.lElbow, skeleton.lWrist, r(8), fill);
  drawCapsule(ctx, skeleton.rShoulder, skeleton.rElbow, r(9), fill);
  drawCapsule(ctx, skeleton.rElbow, skeleton.rWrist, r(8), fill);
  drawCapsule(ctx, skeleton.lHip, skeleton.lKnee, r(10), fill);
  drawCapsule(ctx, skeleton.lKnee, skeleton.lAnkle, r(8), fill);
  drawCapsule(ctx, skeleton.rHip, skeleton.rKnee, r(10), fill);
  drawCapsule(ctx, skeleton.rKnee, skeleton.rAnkle, r(8), fill);

  // Head only (no face). Small wrist/ankle tips — not sphere joints.
  drawJointBlob(ctx, skeleton.head, headRadius, fill);
  const headPx = px(skeleton.head);
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(2, r(2));
  ctx.beginPath();
  ctx.arc(headPx.x, headPx.y, headRadius, 0, Math.PI * 2);
  ctx.stroke();

  drawJointBlob(ctx, skeleton.lWrist, r(5), fill);
  drawJointBlob(ctx, skeleton.rWrist, r(5), fill);
  drawJointBlob(ctx, skeleton.lAnkle, r(6), fill);
  drawJointBlob(ctx, skeleton.rAnkle, r(6), fill);
}

/** Draw a Day slot mannequin on white. */
export function drawDayPoseGuide(
  ctx: CanvasRenderingContext2D,
  slotId: DaySlotId | PoseGuideKey | string,
  visualStyle: PoseGuideVisualStyle = 'filled'
): void {
  const skeleton = SLOT_SKELETONS[normalizePoseKey(slotId)] ?? SLOT_SKELETONS.afternoon;
  if (visualStyle === 'openpose') {
    drawOpenPoseFigures(ctx, [skeleton], WIDTH, HEIGHT);
    return;
  }
  const outline = RAPID_AIO_OUTLINE_PALETTE[0]!;
  drawStickSkeleton(ctx, skeleton, {
    visualStyle,
    strokeStyle: visualStyle === 'outline-gray' ? outline.stroke : undefined,
    lineWidth: visualStyle === 'outline-gray' ? outline.lineWidth : undefined,
    headRadius: visualStyle === 'outline-gray' ? 24 : undefined,
  });
}

/** Draw freshly synthesized mannequin stance(s) from scene text (1–3 figures). */
export function drawPoseGuideFromScene(
  ctx: CanvasRenderingContext2D,
  text: string | null | undefined,
  fallbackIndex = 0,
  visualStyle: PoseGuideVisualStyle = 'filled',
  options?: { forcePeople?: number; clothedUprightOnly?: boolean; allowIntimate?: boolean }
): PoseGuideIntent {
  return drawPoseGuideFiguresFromScene(ctx, text, fallbackIndex, visualStyle, options).intent;
}

function drawPoseGuideFiguresFromScene(
  ctx: CanvasRenderingContext2D,
  text: string | null | undefined,
  fallbackIndex: number,
  visualStyle: PoseGuideVisualStyle,
  options?: { forcePeople?: number; clothedUprightOnly?: boolean; allowIntimate?: boolean }
): { intent: PoseGuideIntent; figures: StickSkeleton[] } {
  const { intent, figures } = synthesizeSceneStickFigures(text, fallbackIndex, options);
  if (visualStyle === 'openpose') {
    // Pure keypoint map — no wall/chaise props: gray blocks are not part of the format the
    // model learned, and the beat text already names the furniture.
    drawOpenPoseFigures(ctx, figures, WIDTH, HEIGHT);
    return { intent, figures };
  }
  if (intent.intimate === 'wall') {
    // Visual wall cue so Edit doesn't invent a center-floor kneel.
    ctx.fillStyle = visualStyle === 'outline-gray' ? OUTLINE_GRAY_PAPER : '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(0, 0, Math.round(WIDTH * 0.1), HEIGHT);
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(Math.round(WIDTH * 0.1), 0);
    ctx.lineTo(Math.round(WIDTH * 0.1), HEIGHT);
    ctx.stroke();
  } else if (
    intent.intimate === 'lift' &&
    /\b(chaise|daybed|fainting\s+couch)\b/i.test(text || '')
  ) {
    // Long chaise silhouette so Edit doesn't invent a short couch lap-sit.
    ctx.fillStyle = visualStyle === 'outline-gray' ? OUTLINE_GRAY_PAPER : '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#c8c8c8';
    const chaiseY = Math.round(HEIGHT * 0.62);
    ctx.fillRect(
      Math.round(WIDTH * 0.2),
      chaiseY,
      Math.round(WIDTH * 0.65),
      Math.round(HEIGHT * 0.12)
    );
    ctx.fillRect(
      Math.round(WIDTH * 0.72),
      Math.round(HEIGHT * 0.48),
      Math.round(WIDTH * 0.1),
      Math.round(HEIGHT * 0.26)
    );
  }
  figures.forEach((figure, index) => {
    const isLead = index === 0;
    if (visualStyle === 'outline-gray') {
      const outline = RAPID_AIO_OUTLINE_PALETTE[index % RAPID_AIO_OUTLINE_PALETTE.length]!;
      // Duo+: keep partner nearly as thick as lead — thin partner outlines get dropped by Edit.
      const duoBoost = figures.length > 1;
      drawStickSkeleton(ctx, figure, {
        clear:
          intent.intimate === 'wall' ||
          (intent.intimate === 'lift' && /\bchaise\b/i.test(text || ''))
            ? false
            : index === 0,
        visualStyle: 'outline-gray',
        strokeStyle: outline.stroke,
        lineWidth: duoBoost ? (isLead ? 3.8 : 3.5) : outline.lineWidth,
        headRadius: duoBoost ? (isLead ? 28 : 25) : 24,
      });
      return;
    }
    const palette = MULTI_FIGURE_PALETTE[index % MULTI_FIGURE_PALETTE.length]!;
    drawStickSkeleton(ctx, figure, {
      clear:
        intent.intimate === 'wall' || (intent.intimate === 'lift' && /\bchaise\b/i.test(text || ''))
          ? false
          : index === 0,
      fillStyle: palette.fill,
      strokeStyle: palette.stroke,
      // Larger lead so models can tell which body gets Image 1 identity.
      headRadius: figures.length > 1 ? (isLead ? 36 : 30) : 30,
      lineWidth: figures.length > 1 ? (isLead ? 5.5 : 5) : 5,
    });
  });
  return { intent, figures };
}

export function dayPoseGuideSize(): { width: number; height: number } {
  return { width: WIDTH, height: HEIGHT };
}

/** A rasterized Image 3 guide plus what the prompt needs to describe it. */
export type PoseGuideBuild = {
  file: File;
  style: PoseGuideVisualStyle;
  /** Figures actually drawn (1–3). */
  figureCount: number;
  /** OpenPose multi-figure only: where the lead (Image 1) skeleton sits. */
  leadPosition: PoseLeadPosition | null;
  /** Layout label, for logs and the file name. */
  label: string;
};

async function canvasToPoseGuideFile(
  draw: (ctx: CanvasRenderingContext2D) => string,
  filenamePrefix: string
): Promise<File> {
  if (typeof document === 'undefined') {
    throw new Error('Pose guide needs a browser canvas.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create a 2D canvas for the pose guide.');
  }
  const tag = draw(ctx);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      result => {
        if (result) {
          resolve(result);
          return;
        }
        reject(new Error('Pose guide PNG encode failed.'));
      },
      'image/png',
      0.92
    );
  });
  return new File([blob], `${filenamePrefix}-${tag}-${Date.now()}.png`, {
    type: 'image/png',
    lastModified: Date.now(),
  });
}

async function buildSceneGuide(
  sceneText: string,
  fallbackIndex: number,
  style: PoseGuideVisualStyle,
  filenamePrefix: string,
  options?: { forcePeople?: number; clothedUprightOnly?: boolean; allowIntimate?: boolean }
): Promise<PoseGuideBuild> {
  const drawn: { intent?: PoseGuideIntent; figures: StickSkeleton[] } = { figures: [] };
  const file = await canvasToPoseGuideFile(ctx => {
    const result = drawPoseGuideFiguresFromScene(ctx, sceneText, fallbackIndex, style, options);
    drawn.intent = result.intent;
    drawn.figures = result.figures;
    return result.intent.label;
  }, filenamePrefix);
  const { figures } = drawn;
  return {
    file,
    style,
    figureCount: figures.length,
    leadPosition: style === 'openpose' ? resolvePoseLeadPosition(figures, WIDTH, HEIGHT) : null,
    label: drawn.intent?.label ?? 'scene',
  };
}

async function buildSlotGuide(
  poseKey: PoseGuideKey,
  style: PoseGuideVisualStyle,
  filenamePrefix: string
): Promise<PoseGuideBuild> {
  const file = await canvasToPoseGuideFile(ctx => {
    drawDayPoseGuide(ctx, poseKey, style);
    return poseKey;
  }, filenamePrefix);
  return { file, style, figureCount: 1, leadPosition: null, label: poseKey };
}

/** Browser-only: rasterize the Day slot pose guide to a PNG for Comfy Image 3. */
export async function buildDayPoseGuide(
  slotId: DaySlotId,
  sceneText?: string | null,
  model?: string | null,
  options?: {
    forcePeople?: number;
    clothedUprightOnly?: boolean;
    allowIntimate?: boolean;
    stylePreference?: PoseGuideStylePreference | null;
  }
): Promise<PoseGuideBuild> {
  const style = resolvePoseGuideVisualStyle(model, options?.stylePreference);
  const trimmed = sceneText?.trim() || '';
  if (trimmed) {
    const fallbackIndex = Math.max(0, POSE_KEYS.indexOf(normalizePoseKey(slotId)));
    return buildSceneGuide(trimmed, fallbackIndex, style, 'day-pose-guide', {
      ...(options?.forcePeople != null ? { forcePeople: options.forcePeople } : {}),
      ...(options?.clothedUprightOnly ? { clothedUprightOnly: true } : {}),
      ...(options?.allowIntimate === false ? { allowIntimate: false as const } : {}),
    });
  }
  return buildSlotGuide(normalizePoseKey(slotId), style, 'day-pose-guide');
}

export type StoryPoseGuideInput = {
  title?: string | null;
  blurb?: string | null;
  prompt?: string | null;
  /** Fallback cycle index when the scene text has no stance cue. */
  storyIndex?: number;
  /** Active Comfy model — legacy style gives Rapid AIO / Edit-2511 outline-gray guides. */
  model?: string | null;
  /** Settings pose-guide style (OpenPose by default). */
  stylePreference?: PoseGuideStylePreference | null;
};

/** Prefer scene text stance; otherwise cycle by story index. */
export function resolveStoryPoseGuideKeyFromBeat(input: StoryPoseGuideInput): PoseGuideKey {
  const sceneText = [input.title, input.blurb, input.prompt]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' · ');
  return resolvePoseGuideKeyFromScene(sceneText, input.storyIndex ?? 0);
}

export function sceneTextFromStoryPoseInput(input: StoryPoseGuideInput): string {
  // Clarify first so legacy "taken from behind / bent over" meta still maps to bent layout
  // without feeding poetic prior-title decoys into the pose matcher.
  return [input.title, input.blurb, input.prompt]
    .map(part => part?.trim())
    .filter(Boolean)
    .map(part => clarifyIntimateImageLanguage(part!))
    .join(' · ');
}

/** Browser-only: synthesize a stance from the beat scene text for Story Image 3. */
export async function buildStoryPoseGuide(input: StoryPoseGuideInput): Promise<PoseGuideBuild> {
  const style = resolvePoseGuideVisualStyle(input.model, input.stylePreference);
  const sceneText = sceneTextFromStoryPoseInput(input);
  const fallbackIndex = input.storyIndex ?? 0;
  if (!sceneText) {
    return buildSlotGuide(resolveStoryPoseGuideKey(fallbackIndex), style, 'story-pose-guide');
  }
  return buildSceneGuide(sceneText, fallbackIndex, style, 'story-pose-guide');
}
