/**
 * Gesture check (pure): did the still keep the beat's action — the cup at the mouth, the phone up
 * for a selfie, the pointing arm, the spatula over the pan — not just the posture?
 *
 * The posture check (`pose-score.ts`) catches a still sitting where its guide lies down, but most
 * wrong stills keep the posture and drop the gesture: the arm left down, the prop gone. Two reads:
 *
 * - **Hands** ({@link readHandGestures}): where the guide's lead puts a hand (at the face, raised,
 *   pointing out, on the hips), the still's DWPose body and hand keypoints must put one there too.
 *   Sides are ignored (detectors swap them) and a joint the detector missed is "unknown", never a
 *   miss.
 * - **Action question** ({@link gestureQuestions}): one or two yes/no questions built from the beat
 *   ("Is she holding a phone up to take a selfie?"), asked of the vision model in one call
 *   ({@link gestureVisionPrompt} / {@link parseGestureAnswers}). Only beats with a visible action
 *   get questions; everything else skips the check.
 *
 * {@link decideGesture} folds both into a verdict; {@link applyGestureVerdict} carries a miss into
 * the pose score like a posture miss, so every consumer comparing the score with the gate (Auto-
 * review, Redo pose misses, Best of two, the Gallery badge) acts on it.
 */

import type { NormalizedBody } from '@/lib/pose-library';
import { poseLayoutCue } from '@/lib/pose-coaching';
import { bodyReferenceLength } from '@/lib/pose-posture';
import {
  LIMB_ANGLE_MIN_POSE_MATCH,
  limbVerdictScore,
  type DetectedHands,
  type DetectedPose,
  type PoseMatchResult,
} from '@/lib/pose-score';

export type { DetectedHands };

type Point = { x: number; y: number };

// ── Action questions from the beat ───────────────────────────────────────────────────────

export type GestureQuestion = {
  /** Stable id of the action ("selfie", "drink", …). */
  id: string;
  /** The yes/no question for the vision model. */
  text: string;
  /** What the still missed, in words for the miss panel ("holding the cup"). */
  label: string;
};

/** Who leads the still (Day's `leadNoun`): picks the questions' pronouns. */
export type GestureLead = 'woman' | 'man' | 'person';

type Pronouns = { subject: string; possessive: string; reflexive: string };

const PRONOUNS: Record<GestureLead, Pronouns> = {
  woman: { subject: 'she', possessive: 'her', reflexive: 'herself' },
  man: { subject: 'he', possessive: 'his', reflexive: 'himself' },
  person: { subject: 'the person', possessive: 'their', reflexive: 'themselves' },
};

type GestureSpec = {
  id: string;
  /** Beat words that state this action. */
  beat: RegExp;
  /** Layouts the pose guide draws for it: asked when the beat names the action or is empty. */
  layouts: readonly string[];
  question: (p: Pronouns, beat: string) => string;
  label: (beat: string) => string;
  /** Actions this one already covers (a selfie is a phone held up). */
  covers?: readonly string[];
};

/** Drinks, named as the beat names them. */
const DRINK_WORDS =
  /\b(mug|cup|coffee|tea|latte|espresso|glass(?:es)?|wine|champagne|beer|bottles?|cocktail|drink(?:ing|s)?|sip(?:ping|s)?|toast(?:ing)?|clink(?:ing|s)?)\b/i;
/** The drink is in hand (not "coffee at her elbow", "a glass on the table"). */
const DRINK_HELD =
  /\b(in (?:one|her|his|both|each|the other) hands?|holding|holds|sip(?:ping|s)?|drink(?:ing|s)? (?:from|a|her|his)|to drink|pour(?:ing|s)?|clink(?:ing|s)?|toast(?:ing)?|raising|raises|cradling|with an? (?:mug|cup|coffee|glass|bottle|drink|latte))\b|\b(?:mug|cup|glass|bottle|coffee|drink) in (?:one |her |his |both |each )?hands?\b/i;

/** The drink's container as the beat names it ("clinking bottles" → bottle; "coffee" → cup). */
function drinkNoun(beat: string): string {
  const word =
    /\b(mugs?|cups?|glass(?:es)?|bottles?|beer|wine|champagne|cocktail)\b/i
      .exec(beat)?.[1]
      ?.toLowerCase() ?? '';
  if (/^bottle|^beer/.test(word)) return 'bottle';
  if (/^glass|wine|champagne|cocktail/.test(word)) return 'glass';
  if (/^mug/.test(word)) return 'mug';
  return 'cup';
}

/**
 * Actions the check asks about, most specific first. Each names what must be visible, not how
 * the body stands — the posture check covers that.
 */
const GESTURE_SPECS: readonly GestureSpec[] = [
  {
    id: 'selfie',
    beat: /\bselfies?\b/i,
    layouts: ['selfie', 'selfie_duo'],
    question: p =>
      `Is ${p.subject} taking a selfie — holding a phone up toward ${p.reflexive}, or the photo taken from ${p.possessive} outstretched arm?`,
    label: () => 'taking the selfie',
    covers: ['phone', 'camera'],
  },
  {
    id: 'camera',
    beat: /\b(film camera|camera|photograph(?:ing|s)?|snap(?:ping|s)? a (?:photo|picture|shot)|taking (?:a )?(?:photo|picture)s?)\b/i,
    layouts: ['photograph'],
    question: p => `Is ${p.subject} holding a camera up to ${p.possessive} eye or face?`,
    label: () => 'holding the camera up',
    covers: ['phone'],
  },
  {
    id: 'cook',
    beat: /\b(cook(?:ing|s)?|stir(?:ring|s)?|flip(?:ping|s)? (?:pancakes|eggs|burgers)|chop(?:ping|s)?|fry(?:ing)?|saut[eé](?:ing)?|spatula|wooden spoon)\b/i,
    layouts: ['cook'],
    question: p =>
      `Is ${p.subject} cooking — holding a kitchen utensil (spatula, spoon or knife) over a pan, pot or cutting board?`,
    label: () => 'cooking with a utensil',
  },
  {
    id: 'point',
    beat: /\bpoint(?:ing|s)?\b/i,
    layouts: ['point'],
    question: p => `Is ${p.subject} pointing at something with an outstretched arm?`,
    label: () => 'pointing',
  },
  {
    id: 'eat',
    beat: /\b(eat(?:ing|s)?|a bite|biting into|fork(?:ful)?|slice of|sandwich|pizza|croissant|ice cream)\b/i,
    layouts: ['eat'],
    question: p => `Is ${p.subject} eating — holding food or a fork up to ${p.possessive} mouth?`,
    label: () => 'eating',
  },
  {
    id: 'laptop',
    beat: /\blaptop\b/i,
    layouts: ['laptop'],
    question: p => `Are ${p.possessive} hands on a laptop keyboard?`,
    label: () => 'working on the laptop',
  },
  {
    id: 'read',
    // "menu" / "page" alone don't say she reads (a menu board, a page on the counter).
    beat: /\b(read(?:ing|s)?|book|paperback|novel|magazine|newspaper|flipping through)\b/i,
    layouts: ['read'],
    question: p => `Is ${p.subject} holding or reading a book, menu or page?`,
    label: () => 'reading',
  },
  {
    id: 'phone',
    beat: /\b(phone|texting|text(?:s)?\b|scroll(?:ing|s)?|screen)\b/i,
    layouts: ['phone'],
    question: p => `Is ${p.subject} holding a phone in ${p.possessive} hand?`,
    label: () => 'holding the phone',
  },
  {
    id: 'drink',
    beat: DRINK_WORDS,
    layouts: ['drink', 'toast'],
    question: (p, beat) => `Is ${p.subject} holding a ${drinkNoun(beat)} in ${p.possessive} hand?`,
    label: beat => `holding the ${drinkNoun(beat)}`,
  },
  {
    id: 'wave',
    beat: /\bwav(?:e|es|ing)\b/i,
    layouts: ['wave'],
    // "Is she waving?" got "no" on clear waves (the model wants to see motion): ask what shows.
    question: p => `Is one of ${p.possessive} hands raised up at or above ${p.possessive} head?`,
    label: () => 'waving',
  },
  {
    id: 'arms-up',
    beat: /\b(both arms (?:up|overhead|raised|high)|arms (?:up|overhead|raised high)|throws? (?:both )?(?:her |his )?arms up|stretch(?:ing|es)? (?:both )?(?:her |his )?arms|arms stretched)\b/i,
    layouts: ['arms_up', 'stretch'],
    question: p => `Are ${p.possessive} arms raised above ${p.possessive} head?`,
    label: () => 'arms raised',
  },
  {
    id: 'hands-head',
    beat: /\b(?:hands?|arms) (?:clasped )?behind (?:the|her|his) head\b/i,
    layouts: ['hands_behind_head'],
    question: p => `Are ${p.possessive} hands behind ${p.possessive} head?`,
    label: () => 'hands behind the head',
  },
  {
    id: 'hands-hips',
    beat: /\bhands on (?:the |her |his )?hips\b/i,
    layouts: ['hands_hips'],
    question: p => `Are both of ${p.possessive} hands on ${p.possessive} hips?`,
    label: () => 'hands on the hips',
  },
  {
    id: 'cross-arms',
    beat: /\b(arms (?:crossed|folded)|crossed arms|fold(?:ing|s)? (?:her|his) arms|cross(?:ing|es)? (?:her|his) arms)\b/i,
    layouts: ['cross_arms'],
    question: p => `Are ${p.possessive} arms crossed over ${p.possessive} chest?`,
    label: () => 'arms crossed',
  },
  {
    id: 'hair',
    beat: /\b(?:tuck(?:ing|s)?|touch(?:ing|es)?|run(?:ning|s)?|brush(?:ing|es)?|twirl(?:ing|s)?|push(?:ing|es)?)\b[^.,;]{0,24}\bhair\b|\bhair behind\b/i,
    layouts: ['hair_touch'],
    question: p => `Is one of ${p.possessive} hands touching ${p.possessive} hair?`,
    label: () => 'touching the hair',
  },
  {
    id: 'carry',
    beat: /\b(carry(?:ing|ies)?|totes?|shopping bags?|bag over (?:one|her|his) shoulder)\b/i,
    layouts: ['carry'],
    question: p => `Is ${p.subject} carrying a bag?`,
    label: () => 'carrying the bag',
  },
  {
    id: 'pockets',
    beat: /\bhands? in (?:the |her |his )?pockets\b/i,
    layouts: ['pockets'],
    question: p => `Are ${p.possessive} hands in ${p.possessive} pockets?`,
    label: () => 'hands in the pockets',
  },
  {
    id: 'shrug',
    beat: /\bshrug(?:ging|s)?\b(?! off)/i,
    layouts: ['shrug'],
    question: p => `Is ${p.subject} shrugging with ${p.possessive} palms turned up?`,
    label: () => 'shrugging',
  },
  {
    id: 'high-five',
    beat: /\bhigh[- ]?fiv(?:e|es|ing)\b/i,
    layouts: ['high_five'],
    question: () => 'Are two people meeting their raised hands in a high five?',
    label: () => 'the high five',
  },
];

/** At most this many questions per still (one vision call answers them all). */
export const MAX_GESTURE_QUESTIONS = 2;

/**
 * Questions in one still's vision call: the beat's gesture questions plus the pose check's
 * posture question (`pose-posture-question.ts`).
 */
export const MAX_STILL_VISION_QUESTIONS = MAX_GESTURE_QUESTIONS + 1;

/**
 * The yes/no checks for a still's beat: actions the beat states, in order of how specific they
 * are (a selfie before a phone, a camera before a phone), at most {@link MAX_GESTURE_QUESTIONS}.
 * A drink counts only when it's in hand ("mug in hand", "sipping", "clinking glasses" — not
 * "coffee at her elbow"). With no beat words the drawn layout alone picks the question. Empty
 * for beats with no visible action (a walk, a lie-down, a kiss).
 */
export function gestureQuestions(input: {
  beat?: string | null;
  /** The drawn guide's layout ("drink", "selfie") or pose key ("drink:1"). */
  layout?: string | null;
  lead?: GestureLead;
}): GestureQuestion[] {
  const beat = (input.beat ?? '').trim();
  const layout = (input.layout ?? '').split(':')[0]!.trim();
  const pronouns = PRONOUNS[input.lead ?? 'woman'];
  const stated: GestureSpec[] = [];
  const covered = new Set<string>();
  for (const spec of GESTURE_SPECS) {
    if (covered.has(spec.id)) continue;
    const says = beat
      ? spec.beat.test(beat) && (spec.id !== 'drink' || DRINK_HELD.test(beat))
      : spec.layouts.includes(layout);
    if (!says) continue;
    stated.push(spec);
    for (const id of spec.covers ?? []) covered.add(id);
  }
  // The action the guide draws is the beat's main one: ask only that ("waving …, coffee in the
  // other hand" asks about the wave). A guide that draws no action leaves up to two to ask.
  const drawn = stated.find(spec => spec.layouts.includes(layout));
  const picked = drawn ? [drawn] : stated.slice(0, MAX_GESTURE_QUESTIONS);
  return picked.map(spec => ({
    id: spec.id,
    text: spec.question(pronouns, beat),
    label: spec.label(beat),
  }));
}

// ── Vision question ──────────────────────────────────────────────────────────────────────

/** One call, every question, strict JSON back. */
export function gestureVisionPrompt(questions: readonly GestureQuestion[]): string {
  return [
    'Look at the main person in this image (the largest, most central one) and answer each question about what is actually visible in the picture.',
    ...questions.map(question => `${question.id}: ${question.text}`),
    'Reply with strict JSON only, no other text, in this shape:',
    `{"answers":[${questions
      .map(question => `{"id":"${question.id}","answer":"yes or no","confidence":0-100}`)
      .join(',')}]}`,
    'Say "no" only when the picture clearly does not show it; confidence is how sure you are.',
  ].join('\n');
}

export type GestureAnswer = {
  id: string;
  answer: 'yes' | 'no' | 'unsure';
  /** 0–100. */
  confidence: number;
};

/** Read the model's JSON reply; answers for unknown ids are dropped. Null when unreadable. */
export function parseGestureAnswers(
  text: string | null | undefined,
  questions: readonly GestureQuestion[]
): GestureAnswer[] | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const raw = Array.isArray((parsed as { answers?: unknown })?.answers)
    ? ((parsed as { answers: unknown[] }).answers as unknown[])
    : [];
  const ids = new Set(questions.map(question => question.id));
  const answers = raw.flatMap((entry): GestureAnswer[] => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as { id?: unknown; answer?: unknown; confidence?: unknown };
    const id = String(record.id ?? '').trim();
    if (!ids.has(id)) return [];
    const word = String(record.answer ?? '')
      .trim()
      .toLowerCase();
    const answer = /^(yes|true)\b/.test(word)
      ? 'yes'
      : /^(no|false)\b/.test(word)
        ? 'no'
        : 'unsure';
    let confidence = Number(record.confidence);
    if (!Number.isFinite(confidence)) confidence = 50;
    if (confidence > 0 && confidence <= 1) confidence *= 100;
    return [{ id, answer, confidence: Math.max(0, Math.min(100, confidence)) }];
  });
  return answers.length > 0 ? answers : null;
}

// ── Hands against the guide ──────────────────────────────────────────────────────────────

export type HandGestureKind =
  'hand-to-face' | 'arm-raised' | 'both-arms-raised' | 'arm-out' | 'hands-on-hips';

export type HandGestureRead = {
  kind: HandGestureKind;
  /** The still shows it, doesn't, or too little was read to tell. */
  still: 'shown' | 'missing' | 'unknown';
};

const NOSE = 0;
const NECK = 1;
const R_SHOULDER = 2;
const R_ELBOW = 3;
const R_WRIST = 4;
const L_SHOULDER = 5;
const L_ELBOW = 6;
const L_WRIST = 7;
const R_HIP = 8;
const L_HIP = 11;
const FACE_POINTS = [0, 14, 15, 16, 17] as const;

/** Guide rules, in body reference lengths (`bodyReferenceLength`: about a torso). */
const GUIDE_FACE_REACH = 0.5;
const GUIDE_RAISED_ABOVE_SHOULDER = 0.2;
const GUIDE_OUT_REACH = 0.6;
const GUIDE_HIP_REACH = 0.35;
/** Elbow further out than the wrist by this much: hands on hips, not arms hanging by them. */
const GUIDE_ELBOW_OUT = 0.15;
/** A hand at the face is no higher than this above the nose (higher = a raised arm). */
const FACE_BAND = 0.1;
/** Still rules: looser than the guide's, so natural variation of the same gesture passes. */
const STILL_FACE_REACH = 0.6;
const STILL_RAISED_ABOVE_SHOULDER = 0;
const STILL_OUT_REACH = 0.45;
const STILL_HIP_REACH = 0.5;
const STILL_ELBOW_OUT = 0.08;
/** The hand rules need an upright torso in both (a lying body has no "above the shoulder"). */
const UPRIGHT_TILT_DEG = 35;
/** A detected hand counts from this many in-frame points. */
const MIN_HAND_POINTS = 8;

function scaled(p: Point | null | undefined, aspect: number): Point | null {
  return p ? { x: p.x * aspect, y: p.y } : null;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(points: Array<Point | null>): Point | null {
  const real = points.filter((p): p is Point => Boolean(p));
  if (real.length === 0) return null;
  return {
    x: real.reduce((sum, p) => sum + p.x, 0) / real.length,
    y: real.reduce((sum, p) => sum + p.y, 0) / real.length,
  };
}

function torsoTilt(body: NormalizedBody, aspect: number): number | null {
  const neck = scaled(body[NECK], aspect);
  const hip = mid([scaled(body[R_HIP], aspect), scaled(body[L_HIP], aspect)]);
  if (!neck || !hip) return null;
  const dx = neck.x - hip.x;
  const dy = hip.y - neck.y;
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}

type Arm = { shoulder: Point | null; elbow: Point | null; wrist: Point | null };

function arms(body: NormalizedBody, aspect: number): [Arm, Arm] {
  const at = (i: number) => scaled(body[i], aspect);
  return [
    { shoulder: at(R_SHOULDER), elbow: at(R_ELBOW), wrist: at(R_WRIST) },
    { shoulder: at(L_SHOULDER), elbow: at(L_ELBOW), wrist: at(L_WRIST) },
  ];
}

/** What the guide's lead does with its hands. */
export function guideHandGestures(guide: NormalizedBody, aspect: number): HandGestureKind[] {
  const ref = bodyReferenceLength(guide, aspect);
  const tilt = torsoTilt(guide, aspect);
  if (ref <= 0 || tilt === null || tilt > UPRIGHT_TILT_DEG) return [];
  const nose = scaled(guide[NOSE], aspect);
  const pair = arms(guide, aspect);
  const out: HandGestureKind[] = [];
  // A hand beside the face (phone, cup, hair) is at or under eye level; one higher is raised.
  const atFace = (arm: Arm) =>
    Boolean(
      nose &&
      arm.wrist &&
      dist(arm.wrist, nose) <= GUIDE_FACE_REACH * ref &&
      arm.wrist.y >= nose.y - FACE_BAND * ref
    );
  const nearFace = pair.some(atFace);
  const raised = pair.filter(
    arm =>
      !atFace(arm) &&
      arm.wrist &&
      arm.shoulder &&
      arm.shoulder.y - arm.wrist.y >= GUIDE_RAISED_ABOVE_SHOULDER * ref
  ).length;
  if (nearFace) out.push('hand-to-face');
  if (raised >= 2) out.push('both-arms-raised');
  else if (raised === 1) out.push('arm-raised');
  const outReach = pair.some(
    arm =>
      arm.wrist &&
      arm.shoulder &&
      Math.abs(arm.wrist.x - arm.shoulder.x) >= GUIDE_OUT_REACH * ref &&
      Math.abs(arm.wrist.y - arm.shoulder.y) <= 0.5 * ref
  );
  if (outReach && raised === 0) out.push('arm-out');
  const hips = [scaled(guide[R_HIP], aspect), scaled(guide[L_HIP], aspect)].filter(
    (p): p is Point => Boolean(p)
  );
  const onHips =
    hips.length > 0 &&
    pair.every(
      arm =>
        arm.wrist &&
        hips.some(hip => dist(arm.wrist!, hip) <= GUIDE_HIP_REACH * ref) &&
        elbowOut(arm, mid(hips)?.x ?? null, GUIDE_ELBOW_OUT * ref)
    );
  if (onHips) out.push('hands-on-hips');
  return out;
}

/** The elbow sits further out from the body's middle than the wrist: bent out to the side. */
function elbowOut(arm: Arm, midX: number | null, margin: number): boolean {
  if (!arm.elbow || !arm.wrist || midX === null) return false;
  return Math.abs(arm.elbow.x - midX) - Math.abs(arm.wrist.x - midX) >= margin;
}

function handCenters(hands: DetectedHands | null | undefined, aspect: number): Point[] {
  return [hands?.left, hands?.right].flatMap(points => {
    const inFrame = (points ?? []).filter(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    if (inFrame.length < MIN_HAND_POINTS) return [];
    const center = mid(inFrame)!;
    return [scaled(center, aspect)!];
  });
}

function handPoints(hands: DetectedHands | null | undefined, aspect: number): Point[] {
  return [hands?.left, hands?.right].flatMap(points => {
    const inFrame = (points ?? []).filter(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    return inFrame.length < MIN_HAND_POINTS ? [] : inFrame.map(p => scaled(p, aspect)!);
  });
}

/**
 * Each hand gesture the guide's lead defines, read on the still's lead (body + DWPose hands).
 * Empty when the guide defines none or either torso isn't upright.
 */
export function readHandGestures(input: {
  guide: NormalizedBody;
  guideAspect: number;
  still: NormalizedBody | null | undefined;
  stillHands?: DetectedHands | null;
  stillAspect: number;
}): HandGestureRead[] {
  const kinds = guideHandGestures(input.guide, input.guideAspect);
  if (kinds.length === 0) return [];
  const body = input.still;
  const aspect = input.stillAspect;
  const unknown = kinds.map(kind => ({ kind, still: 'unknown' as const }));
  if (!body) return unknown;
  const ref = bodyReferenceLength(body, aspect);
  const tilt = torsoTilt(body, aspect);
  if (ref <= 0 || tilt === null || tilt > UPRIGHT_TILT_DEG) return unknown;
  const pair = arms(body, aspect);
  const wrists = pair.map(arm => arm.wrist).filter((p): p is Point => Boolean(p));
  const centers = handCenters(input.stillHands, aspect);
  const fingers = handPoints(input.stillHands, aspect);
  const shoulderY = mid(pair.map(arm => arm.shoulder))?.y ?? null;
  const shoulderMid = mid(pair.map(arm => arm.shoulder));
  const hips = [scaled(body[R_HIP], aspect), scaled(body[L_HIP], aspect)].filter((p): p is Point =>
    Boolean(p)
  );
  const handsSeen = wrists.length + centers.length;
  const read = (kind: HandGestureKind): HandGestureRead['still'] => {
    switch (kind) {
      case 'hand-to-face': {
        const face = FACE_POINTS.map(i => scaled(body[i], aspect)).filter((p): p is Point =>
          Boolean(p)
        );
        if (face.length === 0) return 'unknown';
        const near = [...wrists, ...fingers].some(p =>
          face.some(f => dist(p, f) <= STILL_FACE_REACH * ref)
        );
        if (near) return 'shown';
        return handsSeen >= 2 ? 'missing' : 'unknown';
      }
      case 'arm-raised':
      case 'both-arms-raised': {
        if (shoulderY === null) return 'unknown';
        const needed = kind === 'both-arms-raised' ? 2 : 1;
        // Per arm: its wrist, else a hand found near where that forearm points.
        const raised = pair.filter(arm => {
          const tip = arm.wrist ?? null;
          return tip && (arm.shoulder?.y ?? shoulderY) - tip.y >= STILL_RAISED_ABOVE_SHOULDER * ref;
        }).length;
        const raisedHands = centers.filter(
          c => shoulderY - c.y >= STILL_RAISED_ABOVE_SHOULDER * ref
        ).length;
        if (Math.max(raised, raisedHands) >= needed) return 'shown';
        return handsSeen >= 2 ? 'missing' : 'unknown';
      }
      case 'arm-out': {
        if (!shoulderMid) return 'unknown';
        const reach = pair.some(
          arm =>
            arm.wrist &&
            arm.shoulder &&
            Math.abs(arm.wrist.x - arm.shoulder.x) >= STILL_OUT_REACH * ref
        );
        const handReach = centers.some(
          c => Math.abs(c.x - shoulderMid.x) >= STILL_OUT_REACH * ref * 1.3
        );
        if (reach || handReach) return 'shown';
        return wrists.length >= 2 ? 'missing' : 'unknown';
      }
      case 'hands-on-hips': {
        if (hips.length === 0 || wrists.length < 2) return 'unknown';
        const midX = mid(hips)?.x ?? null;
        const both = pair.every(
          arm =>
            arm.wrist &&
            hips.some(hip => dist(arm.wrist!, hip) <= STILL_HIP_REACH * ref) &&
            elbowOut(arm, midX, STILL_ELBOW_OUT * ref)
        );
        return both ? 'shown' : 'missing';
      }
    }
  };
  return kinds.map(kind => ({ kind, still: read(kind) }));
}

/** Words for a hand gesture the still missed. */
export function handGestureWords(kind: HandGestureKind): string {
  switch (kind) {
    case 'hand-to-face':
      return 'a hand up at the face';
    case 'arm-raised':
      return 'an arm raised';
    case 'both-arms-raised':
      return 'both arms raised';
    case 'arm-out':
      return 'an arm reaching out';
    case 'hands-on-hips':
      return 'hands on the hips';
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────────────────────

/**
 * A "no" from the vision model at or above this confidence calls a miss (see the calibration
 * on {@link decideGesture}).
 */
export const GESTURE_NO_CONFIDENCE = 80;

export type GestureVerdict = {
  /** The still missed the beat's gesture. */
  miss: boolean;
  /** What it missed, for the miss panel and the redo nudge ("holding the cup"); null on a hit. */
  missed: string | null;
  /** What decided it. */
  source: 'vision' | 'hands' | 'both' | null;
  questions: GestureQuestion[];
  answers: GestureAnswer[] | null;
  hands: HandGestureRead[];
};

/**
 * Decide from the vision answers and the hand reads. A miss needs the vision model to say "no"
 * with at least {@link GESTURE_NO_CONFIDENCE} to one of the beat's questions. The hand reads
 * never call a miss on their own (see the calibration below) — they are reported on the verdict
 * (`hands`, and `source: 'both'` when they agree with the model).
 *
 * Calibrated 2026-10-03 (scripts/pose-gesture-calibrate.mts) on 324 Day stills from ComfyUI's
 * output with a gesture layout, judged by eye for the beat's gesture / prop — 140 missed it, 184
 * showed it (Rapid, Edit 2511, Qwen-Image 2.1, Klein; everyday, vacation, suggestive; solo and
 * duo), vision model nsfwvision-qwen3-vl-8b-v3:
 *
 *   check                                   caught wrong    false alarms on right   precision
 *   (a) hands alone (a guide gesture gone)   17/140 (12%)        21/184 (11%)            45%
 *   (b) vision "no" (this check)            130/140 (93%)         7/184  (4%)            95%
 *   (c) vision "no" OR hands                130/140 (93%)        11/184  (6%)            92%
 *   (c) vision "no" AND hands                17/140 (12%)         1/184  (1%)            94%
 *
 * Only 104 stills had a hand read at all (the guide drew a hand gesture and both torsos were
 * upright); where it read, it added no catch the model missed, only false alarms. The model
 * answers "no" with 95 almost always, so the confidence bar barely matters. Its false alarms:
 * duo high-five / selfie seen from the side, "hands on hips" with one hand on the hip and one in
 * the hair, a pour read as no cup. With beats only (no layout-only rows): 90/96 caught, 6/178
 * false alarms.
 */
export function decideGesture(input: {
  questions: readonly GestureQuestion[];
  answers: readonly GestureAnswer[] | null | undefined;
  hands?: readonly HandGestureRead[];
  noConfidence?: number;
}): GestureVerdict {
  const threshold = input.noConfidence ?? GESTURE_NO_CONFIDENCE;
  const hands = [...(input.hands ?? [])];
  const answers = input.answers ? [...input.answers] : null;
  const refused = (answers ?? []).find(
    answer => answer.answer === 'no' && answer.confidence >= threshold
  );
  const question = refused ? input.questions.find(q => q.id === refused.id) : undefined;
  const handMiss = hands.some(read => read.still === 'missing');
  if (question) {
    return {
      miss: true,
      missed: question.label,
      source: handMiss ? 'both' : 'vision',
      questions: [...input.questions],
      answers,
      hands,
    };
  }
  return {
    miss: false,
    missed: null,
    source: null,
    questions: [...input.questions],
    answers,
    hands,
  };
}

/**
 * What to check on a still: the beat's questions and the lead's hand reads against its guide
 * (the body the pose match assigned to the guide's lead). `questions` empty = no gesture to check
 * (skip the vision call).
 */
export function planGestureCheck(input: {
  beat?: string | null;
  /** The guide's pose key ("drink:1") or layout. */
  poseKey?: string | null;
  lead?: GestureLead;
  guide: NormalizedBody[];
  guideAspect: number;
  detected: DetectedPose;
  match: Pick<PoseMatchResult, 'assignment'>;
}): { questions: GestureQuestion[]; hands: HandGestureRead[] } {
  const questions = gestureQuestions({
    beat: input.beat,
    layout: input.poseKey,
    lead: input.lead,
  });
  if (questions.length === 0) return { questions, hands: [] };
  const lead = input.guide[0];
  const index = input.match.assignment[0] ?? -1;
  const { width, height } = input.detected.canvas;
  const hands = lead
    ? readHandGestures({
        guide: lead,
        guideAspect: input.guideAspect,
        still: index >= 0 ? input.detected.people[index] : null,
        stillHands: index >= 0 ? input.detected.hands?.[index] : null,
        stillAspect: width > 0 && height > 0 ? width / height : input.guideAspect,
      })
    : [];
  return { questions, hands };
}

/**
 * Carry a gesture verdict into the pose match: kept on `gestureCheck`, and a miss on a still
 * that otherwise matched drops its score into the miss band (as a posture miss does), so every
 * consumer comparing the score with the gate acts on it.
 */
export function applyGestureVerdict(
  result: PoseMatchResult,
  verdict: GestureVerdict | null | undefined
): PoseMatchResult {
  if (!verdict) return result;
  const next = { ...result, gestureCheck: verdict };
  if (!verdict.miss || result.method !== 'limb-angle' || result.score < LIMB_ANGLE_MIN_POSE_MATCH) {
    return next;
  }
  return { ...next, score: Math.round(limbVerdictScore(result.limbScore, true) * 100) / 100 };
}

/** Prompt line for a redo after a gesture miss: the action, then the layout's joint cue. */
export function gestureFixNudge(
  missed: string | null | undefined,
  layout?: string | null,
  lead: GestureLead = 'woman'
): string {
  if (!missed) return '';
  const cue = poseLayoutCue((layout ?? '').split(':')[0]);
  const subject = PRONOUNS[lead].subject;
  return `GESTURE (missed last time): ${subject} must be visibly ${missed}${cue ? ` — ${cue}` : ''}.`;
}
