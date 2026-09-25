/**
 * Pose coaching: words for what the Image 3 guide draws, and what a still got wrong.
 *
 * Edit reads both the skeleton and the prompt. For layouts it keeps missing, saying the key
 * joints in words ("one hand stirring a pot, head tilted down to it") often lands the pose
 * where the skeleton alone didn't — so the cue is added after a pose miss, and always for
 * layouts with a poor record, before the guide gives up and draws a plainer pose.
 *
 * Pure; no browser or ComfyUI.
 */

import type { NormalizedBody } from '@/lib/pose-library';

/** Body-part description per layout — what must be true of the joints, not the scene. */
const POSE_LAYOUT_CUES: Record<string, string> = {
  // Everyday
  phone: 'one hand holds a phone up near the face, elbow bent, eyes on the screen',
  drink: 'one hand holds a cup or glass at chest height, elbow bent close to the body',
  read: 'both hands hold a book or page open at chest height, head tilted down reading',
  carry: 'one arm hangs straight down holding a bag or strap, shoulders level',
  wave: 'one arm raised high with an open palm, the other arm relaxed at the side',
  point: 'one arm extended straight out pointing into the distance, head turned the same way',
  pockets: 'both hands tucked into pockets, elbows slightly out, relaxed shoulders',
  cross_arms: 'both forearms folded across the chest, hands tucked at the elbows',
  hands_hips: 'both hands on the hips, elbows bent out to the sides',
  hair_touch: 'one hand raised touching the hair behind the ear, elbow up and out',
  shrug: 'both palms turned up at waist height, shoulders raised',
  look_back: 'body turned away, head and shoulders twisted back over one shoulder to look behind',
  stretch: 'both arms stretched high overhead, back long, up on the balls of the feet',
  lean_wall: 'one shoulder and hip leaning against a wall, one foot crossed over the other',
  rail: 'both forearms resting on a rail in front, upper body leaning forward onto it',
  foot_up: 'one foot raised up onto a step or bench, knee bent high, the other leg straight',
  bend_pick: 'bent forward at the hips, one arm reaching down toward the ground',
  stairs: 'mid-step on stairs, one foot a step higher than the other, knee bent',
  climb: 'climbing: one arm reaching up for a hold, one knee raised high',
  sit_floor: 'sitting on the floor cross-legged, knees wide apart, hands resting on the knees',
  lounge_elbows: 'lying back propped up on both elbows, legs stretched out in front',
  lie_front: 'lying on the stomach, propped on the forearms, lower legs raised behind',
  lie_side: 'lying on one side, head propped on one hand, top knee bent forward',
  perch_edge: 'sitting on a high edge, legs dangling down, hands on the edge beside the hips',
  hands_behind_head: 'both hands clasped behind the head, elbows wide open to the sides',
  arms_up: 'both arms thrown straight up above the head in a V',
  selfie: 'one arm extended up and out holding a phone toward the face, looking at it',
  photograph: 'both hands hold a camera up to one eye, elbows raised',
  cook: 'standing at a counter or stove, one hand stirring or chopping in front, head tilted down to it',
  laptop:
    'seated with both hands on a laptop keyboard in front, forearms forward, eyes on the screen',
  eat: 'one hand brings food or a fork up to the mouth, elbow bent',
  // Two people
  hug: 'the two people face each other, arms wrapped around each other, chests close',
  dance: 'the two people face each other, one hand joined and held out, the other at the waist',
  fight: 'both in a sparring stance facing each other, fists raised, knees bent',
  hold_hands: 'side by side, the inner hands joined between them, both walking the same way',
  piggyback:
    'one person carries the other on their back, arms around the shoulders, legs at the hips',
  high_five: 'facing each other, each with one arm raised so the palms meet above head height',
  toast: 'facing each other, each raising a glass so the glasses meet in the middle',
  head_shoulder: "side by side, one person's head resting on the other's shoulder",
  selfie_duo:
    'side by side with heads close, the lead holds a phone out at arm length toward both faces',
  // Sport
  sport_sprint:
    'mid-sprint: one knee driven high, opposite arm swung forward, body leaning forward',
  sport_yoga_warrior:
    'warrior pose: feet wide, front knee bent over the ankle, both arms straight out',
  sport_yoga_dog:
    'downward dog: hands and feet on the mat, hips pushed up high, body in an upside-down V',
  sport_cycle:
    'on a bike: leaning forward to the handlebars, one knee up and one leg extended on the pedals',
  sport_swing:
    'golf swing follow-through: arms high over the lead shoulder, torso rotated, back heel up',
  sport_serve:
    'tennis serve: racket arm reaching straight up overhead, other arm pointing up, back arched',
  sport_forehand:
    'forehand: racket arm swung across the body at waist height, torso rotated, knees bent',
  sport_jump_shot: 'jump shot: both feet off the ground, ball held above the head in both hands',
  sport_kick: 'kicking: kicking leg swung forward high, arms out for balance, standing leg planted',
  sport_throw:
    'throwing: throwing arm cocked back behind the head, other arm pointing forward, long stride',
  sport_lunge:
    'deep lunge: front knee bent at ninety degrees, back knee near the ground, torso upright',
  sport_handstand: 'handstand: upside down on straight arms, legs straight up together',
  sport_pitch: 'pitching: throwing arm high behind, front knee lifted, torso turned sideways',
  sport_stick:
    'stick handling: bent low at the knees and hips, both hands on the stick near the ground',
  sport_block: 'blocking: both arms raised straight up at the net, up on the toes',
  sport_hurdle:
    'clearing a hurdle: lead leg straight out in front, trail leg bent out to the side, body leaning forward',
  sport_slide:
    'sliding: one leg extended forward along the ground, the other bent under, one arm raised',
  sport_dunk: 'dunk: in the air with one arm reaching up high above the rim, knees bent under',
  sport_ski: 'skiing: knees bent, hips low, both poles angled back, leaning forward down the slope',
  sport_putt:
    'putting: bent over at the hips, both hands together on the putter down between the feet',
  sport_overhead: 'overhead smash: racket arm reaching high above the head, other arm pointing up',
  sport_swim: 'swimming: body horizontal, one arm reaching forward over the water, face down',
  sport_spike: 'spiking: in the air, hitting arm cocked high behind the head, other arm forward',
  sport_box: 'boxing: fists up guarding the chin, one arm extended in a punch, knees bent',
  sport_surf: 'surfing: crouched sideways on the board, knees bent, arms out wide for balance',
  sport_squat: 'barbell squat: bar across the upper back, hips down level with the knees, chest up',
  sport_deadlift:
    'deadlift: bent at the hips with a flat back, both hands gripping the bar near the shins',
  sport_pushup: 'push-up: body in a straight horizontal line on straight arms and toes',
  sport_plank: 'plank: body straight and horizontal, resting on the forearms and toes',
  sport_pullup:
    'pull-up: hanging from a bar overhead with both hands, chin at the bar, feet off the ground',
  sport_skate: 'skateboarding: sideways on the board, knees bent, arms out for balance',
};

/** Words for a layout's key joints, or null for layouts without one (plain postures, sex). */
export function poseLayoutCue(layout: string | null | undefined): string | null {
  const key = layout?.trim();
  return key ? (POSE_LAYOUT_CUES[key] ?? null) : null;
}

/** Prompt line for a cued layout. */
export function poseLayoutCueLine(layout: string | null | undefined): string {
  const cue = poseLayoutCue(layout);
  return cue ? `POSE DETAIL (as Image 3 shows): ${cue}.` : '';
}

/** Every layout with a cue (for tests and docs). */
export const CUED_POSE_LAYOUTS: readonly string[] = Object.keys(POSE_LAYOUT_CUES);

// ── What a still got wrong ────────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

/** COCO-18 joint indices (the person's own left / right). */
const J = {
  neck: 1,
  rShoulder: 2,
  rElbow: 3,
  rWrist: 4,
  lShoulder: 5,
  lElbow: 6,
  lWrist: 7,
  rHip: 8,
  rKnee: 9,
  rAnkle: 10,
  lHip: 11,
  lKnee: 12,
  lAnkle: 13,
} as const;

type Limb = {
  name: string;
  root: number;
  mid: number;
  tip: number;
  kind: 'arm' | 'leg';
};

const LIMBS: readonly Limb[] = [
  { name: 'right arm', root: J.rShoulder, mid: J.rElbow, tip: J.rWrist, kind: 'arm' },
  { name: 'left arm', root: J.lShoulder, mid: J.lElbow, tip: J.lWrist, kind: 'arm' },
  { name: 'right leg', root: J.rHip, mid: J.rKnee, tip: J.rAnkle, kind: 'leg' },
  { name: 'left leg', root: J.lHip, mid: J.lKnee, tip: J.lAnkle, kind: 'leg' },
];

/** Undo the canvas aspect so angles are measured in real proportions. */
function scaled(p: Pt | null | undefined, aspect: number): Pt | null {
  return p ? { x: p.x * aspect, y: p.y } : null;
}

/** Angle of a→b from straight down, 0–180°. */
function angleFromDown(a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dy / len))) * 180) / Math.PI;
}

/** Bend at the middle joint, 0 (straight) – 180 (folded). */
function bendAt(a: Pt, b: Pt, c: Pt): number {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  if (lu < 1e-6 || lv < 1e-6) return 0;
  const cos = (u.x * v.x + u.y * v.y) / (lu * lv);
  return 180 - (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

function limbDirection(kind: 'arm' | 'leg', fromDown: number, bend: number): string {
  if (kind === 'arm') {
    if (fromDown >= 125) return 'raised';
    if (fromDown >= 55) return 'out to the side';
    return bend >= 70 ? 'bent at the elbow' : 'down';
  }
  if (fromDown >= 55) return 'lifted';
  return bend >= 60 ? 'bent at the knee' : 'straight down';
}

function torsoLean(body: NormalizedBody, aspect: number): number | null {
  const neck = scaled(body[J.neck], aspect);
  const hips = [scaled(body[J.rHip], aspect), scaled(body[J.lHip], aspect)].filter((p): p is Pt =>
    Boolean(p)
  );
  if (!neck || hips.length === 0) return null;
  const mid = {
    x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
    y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
  };
  // Angle of hips→neck from straight up.
  return angleFromDown(neck, mid);
}

function torsoWord(fromUpright: number): string {
  if (fromUpright >= 60) return 'horizontal';
  if (fromUpright >= 25) return 'leaning';
  return 'upright';
}

export type PoseLimbMiss = {
  part: string;
  guide: string;
  still: string;
};

/**
 * The lead's limbs (and torso) whose direction in the still differs clearly from the guide,
 * body orientation first, then worst limb first — e.g. `{ part: 'left arm', guide: 'raised', still: 'down' }`. Joints missing
 * on either side are skipped.
 */
export function describePoseLimbMisses(input: {
  guide: NormalizedBody;
  guideAspect: number;
  still: NormalizedBody;
  stillAspect: number;
  /** Degrees of direction difference that count as a miss. */
  threshold?: number;
}): PoseLimbMiss[] {
  const threshold = input.threshold ?? 45;
  const misses: Array<PoseLimbMiss & { off: number }> = [];
  const guideTorso = torsoLean(input.guide, input.guideAspect);
  const stillTorso = torsoLean(input.still, input.stillAspect);
  if (guideTorso !== null && stillTorso !== null) {
    const off = Math.abs(guideTorso - stillTorso);
    const g = torsoWord(guideTorso);
    const s = torsoWord(stillTorso);
    if (off >= threshold && g !== s) {
      misses.push({ part: 'body', guide: g, still: s, off });
    }
  }
  for (const limb of LIMBS) {
    const g = [limb.root, limb.mid, limb.tip].map(i => scaled(input.guide[i], input.guideAspect));
    const s = [limb.root, limb.mid, limb.tip].map(i => scaled(input.still[i], input.stillAspect));
    if (g.some(p => !p) || s.some(p => !p)) continue;
    const [g0, g1, g2] = g as [Pt, Pt, Pt];
    const [s0, s1, s2] = s as [Pt, Pt, Pt];
    const gDir = angleFromDown(g0, g2);
    const sDir = angleFromDown(s0, s2);
    const gBend = bendAt(g0, g1, g2);
    const sBend = bendAt(s0, s1, s2);
    const off = Math.max(Math.abs(gDir - sDir), Math.abs(gBend - sBend) * 0.75);
    const guideWord = limbDirection(limb.kind, gDir, gBend);
    const stillWord = limbDirection(limb.kind, sDir, sBend);
    if (off >= threshold && guideWord !== stillWord) {
      misses.push({ part: limb.name, guide: guideWord, still: stillWord, off });
    }
  }
  // A wrong body orientation (lying vs upright) comes first — it explains the limbs too.
  return misses
    .sort((a, b) => Number(b.part === 'body') - Number(a.part === 'body') || b.off - a.off)
    .map(({ part, guide, still }) => ({ part, guide, still }));
}

/** One line for a card: "left arm down (guide: raised) · body upright (guide: leaning)". */
export function formatPoseLimbMisses(misses: PoseLimbMiss[], max = 2): string {
  return misses
    .slice(0, max)
    .map(miss => `${miss.part} ${miss.still} (guide: ${miss.guide})`)
    .join(' · ');
}

// ── Miss view: the still's skeleton laid over the guide ───────────────────────────────────

/** What a card shows for a pose miss: the lead as drawn, the lead as rendered, and the diff. */
export type PoseMissView = {
  imageUrl: string;
  score: number;
  /** Guide lead, 0–1 of the guide canvas. */
  guide: NormalizedBody;
  /** Guide canvas width / height. */
  aspect: number;
  /** Still lead, moved and scaled onto the guide (neck and hips lined up), 0–1 of the guide. */
  still: NormalizedBody;
  misses: PoseLimbMiss[];
};

function torsoAnchors(body: NormalizedBody, aspect: number): { neck: Pt; hips: Pt } | null {
  const neck = scaled(body[J.neck], aspect);
  const hips = [scaled(body[J.rHip], aspect), scaled(body[J.lHip], aspect)].filter((p): p is Pt =>
    Boolean(p)
  );
  if (!neck || hips.length === 0) return null;
  return {
    neck,
    hips: {
      x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
      y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
    },
  };
}

/**
 * Move and scale the still's lead onto the guide's so their necks meet and torsos are the same
 * length — no rotation, so a lean or a lie still shows as a lean or a lie.
 */
export function alignBodyToGuide(input: {
  still: NormalizedBody;
  stillAspect: number;
  guide: NormalizedBody;
  guideAspect: number;
}): NormalizedBody {
  const g = torsoAnchors(input.guide, input.guideAspect);
  const s = torsoAnchors(input.still, input.stillAspect);
  if (!g || !s) {
    return input.still.map(p => (p ? { ...p } : null));
  }
  const gLen = Math.hypot(g.hips.x - g.neck.x, g.hips.y - g.neck.y);
  const sLen = Math.hypot(s.hips.x - s.neck.x, s.hips.y - s.neck.y);
  const scale = sLen > 1e-6 ? gLen / sLen : 1;
  return input.still.map(p => {
    const q = scaled(p, input.stillAspect);
    if (!q) return null;
    return {
      x: (g.neck.x + (q.x - s.neck.x) * scale) / input.guideAspect,
      y: g.neck.y + (q.y - s.neck.y) * scale,
    };
  });
}

/** Miss view for the lead, or null when either side has no usable lead. */
export function buildPoseMissView(input: {
  imageUrl: string;
  score: number;
  guide: NormalizedBody[];
  guideAspect: number;
  /** Detected people in guide order (lead first), as the pose score assigned them. */
  still: Array<NormalizedBody | undefined>;
  stillAspect: number;
}): PoseMissView | null {
  const guide = input.guide[0];
  const still = input.still[0];
  if (!guide || !still) return null;
  return {
    imageUrl: input.imageUrl,
    score: input.score,
    guide,
    aspect: input.guideAspect,
    still: alignBodyToGuide({
      still,
      stillAspect: input.stillAspect,
      guide,
      guideAspect: input.guideAspect,
    }),
    misses: describePoseLimbMisses({
      guide,
      guideAspect: input.guideAspect,
      still,
      stillAspect: input.stillAspect,
    }),
  };
}

/** Requeue nudge naming the limbs to fix ("left arm raised, not down"). */
export function poseLimbFixNudge(misses: PoseLimbMiss[], max = 3): string {
  if (misses.length === 0) return '';
  const parts = misses.slice(0, max).map(miss => `${miss.part} ${miss.guide}, not ${miss.still}`);
  return `Fix the pose: ${parts.join('; ')}.`;
}
