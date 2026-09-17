/**
 * Crude stick-figure pose guides for Day / Story Image 3.
 * Qwen Edit Plus already encodes image1–4; Image 3 supplies layout without
 * fighting Keep/Cast (Image 1) or the clothing packshot (Image 2).
 *
 * Day keeps canned slot skeletons. Story synthesizes a fresh stick stance from
 * the beat title/blurb/prompt (stable hash → same beat redraws the same pose).
 */

import type { DaySlotId } from '@/lib/day-planner';

type Point = { x: number; y: number };

/** Normalized 0–1 skeleton joints for a full-body stick figure. */
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
 * (close embrace, dance frame, spar, climb, phone, look-back).
 */
export type SocialLayout = 'hug' | 'dance' | 'fight' | 'climb' | 'phone' | 'look_back';

const SOCIAL_SOLO_LAYOUTS: ReadonlySet<SocialLayout> = new Set(['climb', 'phone', 'look_back']);

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
  /** Non-intimate dedicated layout (hug/dance/fight/climb/phone/look-back). */
  social?: SocialLayout | null;
};

/** Slot-default stick poses — crude but distinct stances for morning→night. */
const SLOT_SKELETONS: Record<PoseGuideKey, StickSkeleton> = {
  morning: {
    head: { x: 0.5, y: 0.12 },
    neck: { x: 0.5, y: 0.2 },
    pelvis: { x: 0.5, y: 0.48 },
    lShoulder: { x: 0.38, y: 0.24 },
    rShoulder: { x: 0.62, y: 0.24 },
    lElbow: { x: 0.28, y: 0.34 },
    rElbow: { x: 0.72, y: 0.32 },
    lWrist: { x: 0.22, y: 0.42 },
    rWrist: { x: 0.78, y: 0.28 },
    lHip: { x: 0.44, y: 0.48 },
    rHip: { x: 0.56, y: 0.48 },
    lKnee: { x: 0.42, y: 0.66 },
    rKnee: { x: 0.58, y: 0.64 },
    lAnkle: { x: 0.4, y: 0.86 },
    rAnkle: { x: 0.6, y: 0.84 },
  },
  afternoon: {
    head: { x: 0.52, y: 0.11 },
    neck: { x: 0.5, y: 0.19 },
    pelvis: { x: 0.48, y: 0.47 },
    lShoulder: { x: 0.4, y: 0.23 },
    rShoulder: { x: 0.62, y: 0.22 },
    lElbow: { x: 0.34, y: 0.36 },
    rElbow: { x: 0.72, y: 0.34 },
    lWrist: { x: 0.3, y: 0.48 },
    rWrist: { x: 0.78, y: 0.44 },
    lHip: { x: 0.44, y: 0.47 },
    rHip: { x: 0.54, y: 0.47 },
    lKnee: { x: 0.36, y: 0.64 },
    rKnee: { x: 0.62, y: 0.66 },
    lAnkle: { x: 0.28, y: 0.84 },
    rAnkle: { x: 0.7, y: 0.86 },
  },
  evening: {
    head: { x: 0.48, y: 0.22 },
    neck: { x: 0.48, y: 0.3 },
    pelvis: { x: 0.5, y: 0.58 },
    lShoulder: { x: 0.36, y: 0.34 },
    rShoulder: { x: 0.6, y: 0.32 },
    lElbow: { x: 0.28, y: 0.44 },
    rElbow: { x: 0.7, y: 0.42 },
    lWrist: { x: 0.34, y: 0.54 },
    rWrist: { x: 0.74, y: 0.52 },
    lHip: { x: 0.44, y: 0.58 },
    rHip: { x: 0.56, y: 0.58 },
    lKnee: { x: 0.4, y: 0.72 },
    rKnee: { x: 0.68, y: 0.7 },
    lAnkle: { x: 0.38, y: 0.88 },
    rAnkle: { x: 0.74, y: 0.78 },
  },
  night: {
    head: { x: 0.5, y: 0.12 },
    neck: { x: 0.5, y: 0.2 },
    pelvis: { x: 0.5, y: 0.48 },
    lShoulder: { x: 0.38, y: 0.24 },
    rShoulder: { x: 0.62, y: 0.24 },
    lElbow: { x: 0.32, y: 0.36 },
    rElbow: { x: 0.68, y: 0.36 },
    lWrist: { x: 0.3, y: 0.48 },
    rWrist: { x: 0.7, y: 0.48 },
    lHip: { x: 0.44, y: 0.48 },
    rHip: { x: 0.56, y: 0.48 },
    lKnee: { x: 0.46, y: 0.66 },
    rKnee: { x: 0.62, y: 0.64 },
    lAnkle: { x: 0.46, y: 0.86 },
    rAnkle: { x: 0.7, y: 0.82 },
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
    /\b(duo|pair|couple|both of (?:you|them)|the two|two (?:people|persons|figures|strangers|friends|lovers)|knee[- ]to[- ]knee|face[- ]to[- ]face|side by side|arm in arm|hand in hand|each other|one another)\b/i.test(
      haystack
    )
  ) {
    return 2;
  }
  if (
    /\bwith (?:a |an |the )?(?:stranger|friend|partner|rival|enemy|lover|guest|newcomer|companion|second person|other (?:person|figure)|someone(?: else)?)\b/i.test(
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
    /\b(sex|sexual|intercourse|make\s+love|lovemaking|hook(?:ing)?\s+up|get(?:ting)?\s+it\s+on|climax|orgasm|penetrat|thrust|grind(?:ing)?|mount(?:s|ing|ed)?|straddl|cowgirl|missionary|doggy|from\s+behind|on\s+top|underneath)\b/i.test(
      haystack
    )
  ) {
    return 2;
  }
  if (/\band (?:another|a second|someone else)\b/i.test(haystack)) {
    return 2;
  }
  return 1;
}

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
  if (
    /\b(missionary|on\s+(?:their|her|his)\s+back|pinned\s+(?:down|beneath|under)|underneath|lying\s+under|on\s+top\s+of\s+(?:them|her|him))\b/i.test(
      haystack
    )
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
  if (
    /\b(doggy(?:[- ]style)?|from\s+behind|bent\s+over|bend(?:s|ing)?\s+over|ass[- ]up|over\s+the\s+(?:desk|table|counter|edge))\b/i.test(
      haystack
    )
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
  if (
    /\b(against\s+the\s+wall|up\s+against\s+(?:the\s+)?wall|wall\s+(?:sex|fuck|pin)|pinned\s+against)\b/i.test(
      haystack
    )
  ) {
    return 'wall';
  }
  if (
    /\b(lift(?:ed|ing)?\s+(?:(?:them|her|him)\s+)?(?:up\s+)?(?:while\s+)?(?:fuck(?:s|ing|ed)?|screw(?:s|ing|ed)?|sex)|carry(?:ing)?\s+(?:(?:them|her|him)\s+)?(?:while\s+)?(?:fuck(?:s|ing|ed)?|screw(?:s|ing|ed)?|sex)|held\s+(?:up|aloft)|legs?\s+wrapped\s+around|picked\s+up\s+(?:and\s+)?(?:fuck|screw))\b/i.test(
      haystack
    )
  ) {
    return 'lift';
  }
  if (
    /\b(oral|blow\s*job|blowjob|going\s+down|cunnilingus|fellatio|between\s+(?:their|her|his)\s+legs|on\s+(?:their|her|his)\s+knees\s+(?:for|in\s+front)|kneeling\s+(?:for|in\s+front|before))\b/i.test(
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
    /\b(sex|fuck|lover|naked|intimate|climax|orgasm|thrust|grind)\b/i.test(haystack)
  ) {
    return 'kneeling';
  }
  if (
    /\b(afterglow|tangled\s+sheets|spent\s+together|soft\s+after|post[- ]?coital|lying\s+together\s+(?:naked|after)|cuddle(?:s|ing)?\s+naked)\b/i.test(
      haystack
    )
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
  if (
    /\b(solo|alone|masturbat(?:e|es|ing|ion)?|self[- ]pleasur|touch(?:ing)?\s+(?:themselves|herself|himself))\b/i.test(
      haystack
    ) &&
    /\b(sex|sexual|naked|nude|erotic|intimate|climax|orgasm|pleasure)\b/i.test(haystack)
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
    /\b(sex|sexual|intercourse|make\s+love|lovemaking|fuck(?:s|ing|ed)?|screw(?:s|ing|ed)?|rail(?:s|ing|ed)?|breed(?:s|ing|ed)?|hook(?:ing)?\s+up|get(?:ting)?\s+it\s+on|climax|orgasm|penetrat|thrust(?:s|ing)?|grind(?:s|ing)?|naked\s+together|in\s+bed\s+together|threesome|three[- ]way|mid[- ]?fuck|mid[- ]?sex|bodies?\s+(?:joined|close)|explicit\s+pose)\b/i.test(
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
 * Map non-intimate scene copy to a dedicated social/action wireframe layout.
 * Intimate layouts win first; these catch hug/dance/fight/climb/phone/look-back.
 */
export function parseSocialLayout(text: string | null | undefined): SocialLayout | null {
  const haystack = text?.trim() || '';
  if (!haystack) {
    return null;
  }
  if (
    /\b(hug(?:s|ging|ged)?|embrace(?:s|d|ing)?|hold(?:s|ing)?\s+(?:them|her|him|each other)\s+close|wrapped\s+(?:in\s+)?(?:arms?|an embrace)|bear[- ]hug)\b/i.test(
      haystack
    )
  ) {
    return 'hug';
  }
  if (
    /\b(danc(?:e|es|ing)|waltz(?:es|ing)?|twirl(?:s|ing)?|spin(?:s|ning)?\s+(?:together|with)|slow\s+dance|ballroom)\b/i.test(
      haystack
    )
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
  if (
    /\b(look(?:s|ing)?\s+(?:back|over\s+(?:the\s+)?shoulder)|over\s+(?:the\s+)?shoulder|glance(?:s|ing)?\s+back|turns?\s+(?:to\s+)?look\s+back|half[- ]turned)\b/i.test(
      haystack
    )
  ) {
    return 'look_back';
  }
  return null;
}

function socialBaseForLayout(layout: SocialLayout): PoseGuideBase {
  switch (layout) {
    case 'climb':
      return 'reach';
    case 'fight':
    case 'dance':
      return 'walk';
    case 'hug':
    case 'phone':
    case 'look_back':
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
  fallbackIndex = 0
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
  const intimate = parseIntimateLayout(haystack);
  const social = intimate ? null : parseSocialLayout(haystack);

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
      stride = 0.25;
      armLeft = 'down';
      armRight = 'hold';
      lean = jitterA > 0.5 ? 0.35 : -0.35;
    }
  } else if (/\b(lie|lying|sprawl|prone|on\s+the\s+(?:floor|ground|bed))\b/i.test(haystack)) {
    base = 'lie';
    stride = 0.55;
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
    /\b(sit(?:ting|s)?|seated|couch|sofa|chair|bench|perch(?:ed|ing)?|lounge(?:s|ing)?|cross-legged)\b/i.test(
      haystack
    )
  ) {
    base = 'sit';
    stride = 0.35;
    armLeft = 'hold';
    armRight = 'hold';
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
    stride = 0.55 + jitterA * 0.25;
    armLeft = 'forward';
    armRight = 'forward';
    matched = true;
  } else if (
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

  let people = countPoseGuidePeople(haystack);
  if (intimate && INTIMATE_SOLO_LAYOUTS.has(intimate)) {
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
    intimate &&
    !INTIMATE_SOLO_LAYOUTS.has(intimate) &&
    /\b(threesome|three[- ]way|mmf|ffm|spit[- ]?roast)\b/i.test(haystack)
  ) {
    people = 3;
  }
  if (social && SOCIAL_SOLO_LAYOUTS.has(social)) {
    // Solo action layouts stay solo unless the copy clearly names a duo/crowd.
    if (people < 2) {
      people = 1;
    }
  } else if (social && people < 2) {
    people = 2;
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
  if (intent.base === 'sit') {
    pelvisY = 0.58;
    headY = 0.22;
    torsoScale = 0.92;
  } else if (intent.base === 'crouch') {
    pelvisY = 0.55;
    headY = 0.2;
    torsoScale = 0.88;
  } else if (intent.base === 'kneel') {
    pelvisY = 0.56;
    headY = 0.18;
  } else if (intent.base === 'lie') {
    // Horizontal-ish figure — still readable as a wireframe cue.
    const ox = centerX - 0.5;
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
    pelvisY = 0.4;
    headY = 0.08;
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

  const walkPhase = intent.base === 'run' ? 0.9 : intent.base === 'walk' ? 0.7 : 0.35;
  const front = stride * walkPhase;
  const flip = seededUnit(seed, 20) > 0.5 ? 1 : -1;

  let lKnee: Point;
  let rKnee: Point;
  let lAnkle: Point;
  let rAnkle: Point;

  if (intent.base === 'sit' || intent.base === 'crouch') {
    lKnee = point(lHip.x - 0.04 + j(17), lHip.y + 0.14 + j(18));
    rKnee = point(rHip.x + 0.12 + j(19), rHip.y + 0.12 + j(20));
    lAnkle = point(lKnee.x - 0.02 + j(21), 0.88 + j(22));
    rAnkle = point(rKnee.x + 0.06 + j(23), 0.86 + j(24));
  } else if (intent.base === 'kneel') {
    lKnee = point(lHip.x - 0.02 + j(17), 0.72 + j(18));
    rKnee = point(rHip.x + 0.08 + j(19), rHip.y + 0.14 + j(20));
    lAnkle = point(lKnee.x - 0.08 + j(21), 0.88 + j(22));
    rAnkle = point(rKnee.x + 0.04 + j(23), 0.86 + j(24));
  } else if (intent.base === 'jump') {
    lKnee = point(lHip.x - 0.06 * flip + j(17), lHip.y + 0.12 + j(18));
    rKnee = point(rHip.x + 0.06 * flip + j(19), rHip.y + 0.14 + j(20));
    lAnkle = point(lKnee.x - 0.04 * flip + j(21), lKnee.y + 0.14 + j(22));
    rAnkle = point(rKnee.x + 0.04 * flip + j(23), rKnee.y + 0.12 + j(24));
  } else {
    // Standing / walk / run / lean / reach — staggered legs from stride.
    lKnee = point(lHip.x - front * 0.2 * flip + j(17), lHip.y + 0.18 + j(18));
    rKnee = point(rHip.x + front * 0.22 * flip + j(19), rHip.y + 0.16 + j(20));
    lAnkle = point(lKnee.x - front * 0.18 * flip + j(21), 0.86 + j(22));
    rAnkle = point(rKnee.x + front * 0.2 * flip + j(23), 0.84 + j(24));
  }

  return {
    head,
    neck,
    pelvis,
    lShoulder,
    rShoulder,
    lElbow: leftArm.elbow,
    rElbow: rightArm.elbow,
    lWrist: leftArm.wrist,
    rWrist: rightArm.wrist,
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
  const j = (n: number) => (seededUnit(seed, salt + n) - 0.5) * 0.025;
  return {
    head: point(cx - 0.18 + j(1), 0.42 + j(2)),
    neck: point(cx - 0.1 + j(3), 0.44 + j(4)),
    pelvis: point(cx + 0.06 + j(5), 0.52 + j(6)),
    lShoulder: point(cx - 0.08 + j(7), 0.38 + j(8)),
    rShoulder: point(cx - 0.08 + j(9), 0.48 + j(10)),
    lElbow: point(cx - 0.18 + j(11), 0.5 + j(12)),
    rElbow: point(cx - 0.16 + j(13), 0.54 + j(14)),
    lWrist: point(cx - 0.22 + j(15), 0.62 + j(16)),
    rWrist: point(cx - 0.2 + j(17), 0.64 + j(18)),
    lHip: point(cx + 0.04 + j(19), 0.5 + j(20)),
    rHip: point(cx + 0.08 + j(21), 0.54 + j(22)),
    lKnee: point(cx + 0.04 + j(23), 0.7 + j(24)),
    rKnee: point(cx + 0.1 + j(25), 0.72 + j(26)),
    lAnkle: point(cx + 0.02 + j(27), 0.88 + j(28)),
    rAnkle: point(cx + 0.12 + j(29), 0.88 + j(30)),
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
 * Nudge overlapping intimate figures so heads stay readable as separate people.
 * Keeps contact poses but avoids near-identical head centers that encourage merges.
 */
function separateIntimateFigures(figures: StickSkeleton[]): StickSkeleton[] {
  if (figures.length < 2) {
    return figures;
  }
  const next = figures.map(fig => ({
    ...fig,
    head: { ...fig.head },
    neck: { ...fig.neck },
  }));
  for (let i = 1; i < next.length; i += 1) {
    const prev = next[i - 1]!;
    const cur = next[i]!;
    const dx = cur.head.x - prev.head.x;
    const dy = cur.head.y - prev.head.y;
    const dist = Math.hypot(dx, dy);
    const minDist = 0.14;
    if (dist < minDist) {
      const pushX = (i % 2 === 0 ? -1 : 1) * 0.08;
      const pushY = dy >= 0 ? 0.06 : -0.06;
      const scale = dist < 0.02 ? 1 : (minDist - dist) / Math.max(dist, 0.01);
      cur.head = point(cur.head.x + pushX * Math.max(scale, 0.5), cur.head.y + pushY);
      cur.neck = point(cur.neck.x + pushX * Math.max(scale, 0.5) * 0.7, cur.neck.y + pushY * 0.5);
    }
  }
  // Third figure: pull farther right so they don't sit on the pair.
  if (next.length >= 3) {
    const third = next[2]!;
    third.head = point(Math.max(third.head.x, 0.78), third.head.y);
    third.neck = point(Math.max(third.neck.x, 0.78), third.neck.y);
  }
  return next;
}

/** Dedicated intimate solo/duo/trio layouts — wireframe silhouettes only. */
export function synthesizeIntimateStickFigures(intent: PoseGuideIntent): StickSkeleton[] {
  const layout = intent.intimate ?? 'generic';
  const seed = intent.seed;
  const wantTrio = intent.people >= 3;
  const pairOrTrio = (pair: StickSkeleton[]) =>
    separateIntimateFigures(wantTrio ? withThird(pair, seed) : pair);

  if (layout === 'solo') {
    return [
      uprightFigure(seed, {
        cx: 0.5,
        base: 'sit',
        salt: 1,
        arms: 'forward',
        lean: 0.05,
      }),
    ];
  }

  if (layout === 'missionary') {
    // Offset heads left/right + vertical stack so Qwen doesn't read one body.
    const bottom = lyingFigure(seed, { cx: 0.46, cy: 0.58, facing: 1, salt: 40 });
    const top = lyingFigure(seed, { cx: 0.58, cy: 0.4, facing: 1, salt: 80 });
    return pairOrTrio([bottom, top]);
  }

  if (layout === 'mating_press') {
    const bottom = legsRaisedBottom(seed, 40);
    bottom.head = point(0.4, 0.58);
    bottom.neck = point(0.46, 0.56);
    const top = lyingFigure(seed, { cx: 0.58, cy: 0.38, facing: 1, salt: 80 });
    top.lKnee = point(0.5, 0.55);
    top.rKnee = point(0.6, 0.55);
    top.lAnkle = point(0.48, 0.68);
    top.rAnkle = point(0.62, 0.68);
    return pairOrTrio([bottom, top]);
  }

  if (layout === 'straddle') {
    const bottom = lyingFigure(seed, { cx: 0.44, cy: 0.6, facing: 1, salt: 40 });
    const top = riderOnPelvis(seed, { cx: 0.54, salt: 2 });
    top.head = point(0.56, 0.16);
    top.neck = point(0.55, 0.24);
    return pairOrTrio([bottom, top]);
  }

  if (layout === 'reverse_straddle') {
    const bottom = lyingFigure(seed, { cx: 0.44, cy: 0.6, facing: 1, salt: 40 });
    const top = riderOnPelvis(seed, { cx: 0.54, facingAway: true, salt: 2 });
    top.head = point(0.6, 0.16);
    top.neck = point(0.58, 0.24);
    return pairOrTrio([bottom, top]);
  }

  if (layout === 'prone') {
    const bottom = lyingFigure(seed, { cx: 0.42, cy: 0.58, facing: 1, salt: 40 });
    bottom.head = point(0.24, 0.54);
    bottom.neck = point(0.32, 0.56);
    const top = lyingFigure(seed, { cx: 0.6, cy: 0.42, facing: 1, salt: 90 });
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
    const bent = bentForwardFigure(seed, 0.38, 50);
    const rear = uprightFigure(seed, {
      cx: 0.64,
      base: 'stand',
      salt: 2,
      arms: 'hold',
      lean: -0.2,
    });
    return separateIntimateFigures(
      wantTrio
        ? [bent, rear, uprightFigure(seed, { cx: 0.18, base: 'stand', salt: 3, lean: 0.2 })]
        : [bent, rear]
    );
  }

  if (layout === 'facesit') {
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
    return pairOrTrio([bottom, top]);
  }

  if (layout === 'oral') {
    const standing = uprightFigure(seed, {
      cx: 0.58,
      base: 'stand',
      salt: 1,
      arms: 'hold',
      lean: -0.15,
    });
    const kneeling = uprightFigure(seed, {
      cx: 0.36,
      base: 'kneel',
      salt: 2,
      arms: 'forward',
      lean: 0.2,
    });
    kneeling.lKnee = point(0.32, 0.74);
    kneeling.rKnee = point(0.4, 0.74);
    kneeling.lAnkle = point(0.28, 0.88);
    kneeling.rAnkle = point(0.42, 0.88);
    return pairOrTrio([kneeling, standing]);
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
    // Back figure pressed to the left "wall"; partner leans in.
    const against = uprightFigure(seed, {
      cx: 0.34,
      base: 'stand',
      salt: 1,
      arms: 'up',
      lean: -0.05,
    });
    against.lWrist = point(0.22, 0.28);
    against.rWrist = point(0.24, 0.32);
    const press = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 2,
      arms: 'hold',
      lean: -0.25,
    });
    return pairOrTrio([against, press]);
  }

  if (layout === 'lift') {
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
    // Elevate and wrap legs around carrier.
    lifted.head = point(0.54, 0.1);
    lifted.neck = point(0.53, 0.18);
    lifted.pelvis = point(0.52, 0.4);
    lifted.lHip = point(0.48, 0.4);
    lifted.rHip = point(0.56, 0.4);
    lifted.lKnee = point(0.42, 0.48);
    lifted.rKnee = point(0.62, 0.48);
    lifted.lAnkle = point(0.4, 0.38);
    lifted.rAnkle = point(0.64, 0.38);
    carrier.lWrist = point(0.48, 0.42);
    carrier.rWrist = point(0.56, 0.42);
    return pairOrTrio([carrier, lifted]);
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

/** Dedicated non-intimate social/action layouts — wireframe silhouettes only. */
export function synthesizeSocialStickFigures(intent: PoseGuideIntent): StickSkeleton[] {
  const layout = intent.social ?? 'hug';
  const seed = intent.seed;
  const wantTrio = intent.people >= 3;
  const pairOrTrio = (pair: StickSkeleton[]) =>
    wantTrio
      ? [...pair, uprightFigure(seed, { cx: 0.82, base: 'stand', salt: 3, lean: -0.1 })]
      : pair;

  if (layout === 'climb') {
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
    if (intent.people <= 1) {
      return [climber];
    }
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
    const figure = uprightFigure(seed, {
      cx: 0.5,
      base: 'stand',
      salt: 1,
      arms: 'hold',
      lean: 0.28,
    });
    // Twist: head and near shoulder pull opposite the lean.
    figure.head = point(0.42, 0.12);
    figure.neck = point(0.46, 0.2);
    figure.lShoulder = point(0.38, 0.26);
    figure.rShoulder = point(0.58, 0.24);
    figure.lWrist = point(0.36, 0.48);
    figure.rWrist = point(0.62, 0.46);
    if (intent.people <= 1) {
      return [figure];
    }
    return pairOrTrio([
      figure,
      uprightFigure(seed, { cx: 0.72, base: 'stand', salt: 2, arms: 'down', lean: -0.1 }),
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
  fallbackIndex = 0
): { intent: PoseGuideIntent; figures: StickSkeleton[] } {
  const intent = parsePoseGuideIntent(text, fallbackIndex);
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

function drawBone(ctx: CanvasRenderingContext2D, a: Point, b: Point, width = 6): void {
  const from = px(a);
  const to = px(b);
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/** Draw a stick skeleton on white — OpenPose-ish crude guide. */
export function drawStickSkeleton(
  ctx: CanvasRenderingContext2D,
  skeleton: StickSkeleton,
  options?: { clear?: boolean; strokeStyle?: string; headRadius?: number }
): void {
  if (options?.clear !== false) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.strokeStyle = options?.strokeStyle ?? '#111111';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const head = px(skeleton.head);
  const headRadius = options?.headRadius ?? 28;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
  ctx.stroke();

  drawBone(ctx, skeleton.head, skeleton.neck, 5);
  drawBone(ctx, skeleton.neck, skeleton.pelvis, 8);
  drawBone(ctx, skeleton.lShoulder, skeleton.rShoulder, 6);
  drawBone(ctx, skeleton.neck, skeleton.lShoulder, 5);
  drawBone(ctx, skeleton.neck, skeleton.rShoulder, 5);
  drawBone(ctx, skeleton.lShoulder, skeleton.lElbow);
  drawBone(ctx, skeleton.lElbow, skeleton.lWrist);
  drawBone(ctx, skeleton.rShoulder, skeleton.rElbow);
  drawBone(ctx, skeleton.rElbow, skeleton.rWrist);
  drawBone(ctx, skeleton.lHip, skeleton.rHip, 6);
  drawBone(ctx, skeleton.pelvis, skeleton.lHip, 5);
  drawBone(ctx, skeleton.pelvis, skeleton.rHip, 5);
  drawBone(ctx, skeleton.lHip, skeleton.lKnee);
  drawBone(ctx, skeleton.lKnee, skeleton.lAnkle);
  drawBone(ctx, skeleton.rHip, skeleton.rKnee);
  drawBone(ctx, skeleton.rKnee, skeleton.rAnkle);
}

/** Distinct stroke colors so multi-person guides read as separate bodies. */
const MULTI_FIGURE_STROKES = ['#111111', '#1a4d8c', '#8b1a1a'] as const;

/** Draw a black stick figure on white — OpenPose-ish crude guide. */
export function drawDayPoseGuide(
  ctx: CanvasRenderingContext2D,
  slotId: DaySlotId | PoseGuideKey | string
): void {
  const skeleton = SLOT_SKELETONS[normalizePoseKey(slotId)] ?? SLOT_SKELETONS.afternoon;
  drawStickSkeleton(ctx, skeleton);
}

/** Draw freshly synthesized stick stance(s) from scene text (1–3 figures). */
export function drawPoseGuideFromScene(
  ctx: CanvasRenderingContext2D,
  text: string | null | undefined,
  fallbackIndex = 0
): PoseGuideIntent {
  const { intent, figures } = synthesizeSceneStickFigures(text, fallbackIndex);
  figures.forEach((figure, index) => {
    drawStickSkeleton(ctx, figure, {
      clear: index === 0,
      strokeStyle:
        figures.length > 1 ? MULTI_FIGURE_STROKES[index % MULTI_FIGURE_STROKES.length] : '#111111',
      headRadius: figures.length > 1 ? 30 : 28,
    });
  });
  return intent;
}

export function dayPoseGuideSize(): { width: number; height: number } {
  return { width: WIDTH, height: HEIGHT };
}

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

async function buildPoseGuideFile(poseKey: PoseGuideKey, filenamePrefix: string): Promise<File> {
  return canvasToPoseGuideFile(ctx => {
    drawDayPoseGuide(ctx, poseKey);
    return poseKey;
  }, filenamePrefix);
}

/** Browser-only: rasterize the stick figure to a PNG File for Comfy Image 3. */
export async function buildDayPoseGuideFile(slotId: DaySlotId): Promise<File> {
  return buildPoseGuideFile(normalizePoseKey(slotId), 'day-pose-guide');
}

export type StoryPoseGuideInput = {
  title?: string | null;
  blurb?: string | null;
  prompt?: string | null;
  /** Fallback cycle index when the scene text has no stance cue. */
  storyIndex?: number;
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
  return [input.title, input.blurb, input.prompt]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' · ');
}

/** Browser-only: synthesize a unique stick stance from the beat scene text. */
export async function buildStoryPoseGuideFile(input: number | StoryPoseGuideInput): Promise<File> {
  if (typeof input === 'number') {
    return buildPoseGuideFile(resolveStoryPoseGuideKey(input), 'story-pose-guide');
  }
  const sceneText = sceneTextFromStoryPoseInput(input);
  const fallbackIndex = input.storyIndex ?? 0;
  return canvasToPoseGuideFile(ctx => {
    const intent = drawPoseGuideFromScene(ctx, sceneText, fallbackIndex);
    return intent.label;
  }, 'story-pose-guide');
}
