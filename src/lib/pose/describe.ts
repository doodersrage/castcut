/**
 * A custom pose in words — the stance first, then the few limb facts that make it this pose and
 * not the plain posture ("kneeling on her right knee, her right hand on her hip, her back to the
 * camera, looking back over her right shoulder").
 *
 * Edit 2511 and Rapid AIO take the pose from the words, not the map: a pose-map A/B (OpenPose vs
 * shaded mannequin vs real photo as Image 3) came out the same per seed, and the Outfit try-on
 * stood up 3/3 until its prompt led with the stance in words. So every custom pose — the joint
 * editor, "From a photo", My poses, Day pose packs, the Outfit try-on, Story's composed poses —
 * goes out with this description as its first pose line.
 *
 * Sides are hers, with the picture's side the first time each is named: COCO-18 joints are
 * labelled by the person's own side (DWPose and the joint editor both), so joint 2–4 is her right
 * arm whichever way she faces — facing the camera it is on the picture's left, seen from behind
 * on its right. Body sides alone were mirrored on one-knee poses (Rapid and Edit 2511 put the
 * other knee down 4/4), so the first "her right …" and "her left …" also say where that limb is
 * in the picture ("her right knee (on the left of the picture) down on the floor"). A/B
 * 2026-10-04, one-knee / over-the-shoulder / arm-up poses × 2 seeds × Rapid and Edit 2511, sides
 * right by eye: body sides 8/12, picture sides only 10/12, both 12/12, no sides 6/12 (the engines
 * pick their own, and Edit 2511 then looked over the other shoulder). Where she looks or faces
 * sideways is said against the picture only ("facing the left of the picture").
 *
 * Pure geometry, no props and no places, so it cannot contradict a beat's setting; "on the
 * floor" is dropped when the scene names something else to sit or lie on.
 */

import type { PhotoPose } from '@/lib/day/pose-guide';
import type { NormalizedBody } from '@/lib/pose/library';
import {
  headTurnSide,
  isThreeQuarterHead,
  readHeadDirection,
  type HeadDirection,
} from '@/lib/pose/limb-presets';
import {
  bodyReferenceLength,
  classifyPosture,
  readLyingKind,
  type PostureClass,
} from '@/lib/pose/posture';
import { bodyCentreX, readPoseStance } from '@/lib/pose/starters';
import { withSceneGround } from '@/lib/scene/surface';
import {
  heldObjectWords,
  visionPostureDecides,
  visionPostureStance,
  type PhotoPosture,
} from '@/lib/pose/vision-posture';

type Pt = { x: number; y: number };

/** One person: at most this many words (the Rapid compact recipes stay short). */
export const POSE_WORDS_SOLO_MAX = 30;
/** Each of two people. */
export const POSE_WORDS_DUO_MAX = 20;
/** Limb facts after the stance. */
const MAX_FACTS = 4;

export type PoseFigureWords = {
  /** The base posture ("standing", "kneeling on her right knee, …", "lying on her back"). */
  stance: string;
  /** Which way the body faces, when it is not the camera ("her back to the camera, …"). */
  view: string | null;
  /** The most telling limb facts, most telling first. */
  facts: string[];
  /** Everything joined, within the word cap. */
  text: string;
};

export type PoseDescribeOptions = {
  /** Canvas width / height (sideways distances are true). Default 2:3. */
  aspect?: number;
  possessive?: 'her' | 'his' | 'their';
  /** The beat / scene words: a seat or bed named there replaces "the floor". */
  sceneText?: string | null;
  maxWords?: number;
  /**
   * Say the picture's side after the first "her right …" / "her left …" (default true). Off for
   * the two figures of a duo, whose lines are already long and were not A/B'd with it.
   */
  pictureSides?: boolean;
  /**
   * The photo's posture as the vision model read it (vision-posture.ts). A supported posture
   * (reclining, lying, sitting, kneeling…) sets the stance; the limbs are still read here.
   */
  posture?: PhotoPosture | null;
};

const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
const mid = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Angle at the knee (hip–knee–ankle), degrees; 180 is a straight leg. */
function jointAngle(a: Pt, b: Pt, c: Pt): number {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  const lengths = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  if (lengths === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / lengths))) * 180) / Math.PI;
}

/** Something to sit or lie on that is not the floor. */
const SURFACE_RE =
  /\b(?:bed|sofa|couch|bench|chair|stool|armchair|lounger|sun ?bed|hammock|grass|lawn|sand|beach|blanket|towel|rug|mat|deck|dock|pier|stairs|steps|ledge|wall|rock|boulder|log|car|hood|counter|desk|table|swing|bath|tub|pool|lap)\b/i;

type Fact = { text: string; weight: number };

/**
 * One figure in words. `possessive` is whose limbs these are ('their' for a partner whose gender
 * the caller leaves to the rest of the prompt).
 */
export function describePoseFigure(
  body: NormalizedBody,
  options: PoseDescribeOptions = {}
): PoseFigureWords {
  const a = options.aspect && options.aspect > 0 ? options.aspect : 2 / 3;
  const whose = options.possessive ?? 'her';
  const maxWords = options.maxWords ?? POSE_WORDS_SOLO_MAX;
  const at = (i: number): Pt | null => {
    const p = body[i];
    return p ? { x: p.x * a, y: p.y } : null;
  };
  // The stance reader speaks of 'her' / 'his'; a partner's 'their' is put in after.
  const readAs = whose === 'his' ? 'his' : 'her';
  const read = readPoseStance(body, { possessive: readAs, aspect: a });
  const ownWords = (text: string) =>
    whose === 'their' ? text.replace(/\bher\b/g, 'their').replace(/\bshe\b/g, 'they') : text;
  // Lying, her limbs are stacked across the picture: its left and right say nothing about them.
  let pictureSides = options.pictureSides !== false;
  const finish = (stance: string, view: string | null, facts: string[]) => {
    const text = [stance, view, ...facts].filter(Boolean).join(', ');
    const placed =
      options.sceneText && SURFACE_RE.test(options.sceneText)
        ? text
            .replace(/ on the floor\b/g, '')
            .replace(/\bflat on the floor\b/g, 'flat')
            .replace(/ to the floor\b/g, ' down')
        : // Outdoors the floor is the ground ("sitting cross-legged on the grass").
          withSceneGround(text, options.sceneText);
    return {
      stance,
      view,
      facts,
      text: ownWords(pictureSides ? withPictureSides(placed, body, a) : placed),
    };
  };
  const neck = at(1);
  const rHip = at(8);
  const lHip = at(11);
  if (!read.unit || !neck || (!rHip && !lHip)) return finish(read.stance, null, []);
  const unit = read.unit;
  const hip = rHip && lHip ? mid(rHip, lHip) : (rHip ?? lHip)!;
  const posture = classifyPosture(body, a);
  // Crouching vs kneeling: the joints tell which knee is down, so they decide between the two.
  // A one-knee kneel read "crouching" by vision lost its knee and Edit 2511 sat on a chair
  // (pose bench re-run, 2026-10-21).
  const lowPair = new Set(['crouching', 'kneeling']);
  const jointsDecideLow =
    lowPair.has(options.posture?.posture ?? '') && lowPair.has(posture.posture);
  const visionStance =
    visionPostureDecides(options.posture) && !jointsDecideLow
      ? visionPostureStance(options.posture, readAs)
      : null;
  const visionLying = Boolean(visionStance && /^lying/.test(visionStance));
  const lying = visionStance
    ? visionLying
    : read.stance === 'lying down' || posture.group === 'lying';
  if (lying) pictureSides = false;

  const legs = (
    [
      ['right', rHip, at(9), at(10)],
      ['left', lHip, at(12), at(13)],
    ] as const
  ).flatMap(([side, legHip, knee, ankle]) =>
    legHip && knee && ankle ? [{ side, hip: legHip, knee, ankle }] : []
  );
  const ground = Math.max(hip.y, ...legs.flatMap(leg => [leg.knee.y, leg.ankle.y]));

  // ── Base posture ──────────────────────────────────────────────────────────────────────
  // One posture model: the classifier (posture.ts — the pose check reads stills with it too)
  // decides what the body is doing; the stance reader only adds detail within that class (which
  // knee is down, a seat vs the floor, a lean). The stance reader alone took its lowest joint for
  // the floor and her feet for what she stands on: seats, squats and kneels read as "standing on
  // her right leg", squats as seats, every stride with a foot off the floor as one-legged.
  let stance = read.stance;
  const [rs, ls] = [at(2), at(5)];
  const nose = at(0);
  const ref = bodyReferenceLength(body, a) || unit;
  const kneeAngles = legs.map(leg => jointAngle(leg.hip, leg.knee, leg.ankle));
  const readLean = read.stance.match(/, (leaning [^,]+)$/)?.[1] ?? null;
  if (visionStance) {
    stance = visionStance;
  } else if (lying) {
    const kind = posture.group === 'lying' ? posture.posture : readLyingKind(body, a);
    stance = lyingStance(kind, readAs);
  } else if (posture.posture === 'all-fours' && !/hands and knees/.test(stance)) {
    stance = 'on all fours';
  } else if (posture.posture === 'upside-down') {
    stance = 'upside down, in a handstand';
  } else if (posture.posture === 'bending') {
    stance =
      bendStance({
        tilt: posture.tiltDeg ?? 0,
        towardCamera: dist(neck, hip) < 0.65 * ref,
        kneeAngles,
        leaningForward: readLean === 'leaning forward',
      }) ?? stance;
  } else if (posture.posture === 'crouching') {
    // Feet planted, hips low, knees folded: a squat (the deep front-on squat and the
    // cross-legged floor sit are told apart below).
    stance =
      kneeAngles.length && Math.min(...kneeAngles) < 85
        ? 'in a deep squat'
        : 'in a squat, knees bent';
  } else if (posture.posture === 'kneeling') {
    if (!/^(?:kneeling|on (?:her|his) hands and knees)/.test(stance)) stance = 'kneeling';
  } else if (posture.posture === 'sitting') {
    if (!/^(?:seated|sitting)/.test(stance)) stance = 'sitting';
  } else if (posture.posture === 'standing') {
    const onFeet = standingLegs(legs, hip, ref, readAs);
    if (onFeet) {
      stance = readLean ? `${onFeet}, ${readLean}` : onFeet;
    } else if (/^(?:standing on|kneeling|seated|sitting|crouching|squatting)/.test(stance)) {
      // Both feet down: never one-legged, never kneeling (the classifier wants a knee on the
      // floor and no straight leg under the hip), and not seated unless the classifier is unsure.
      if (/^(?:standing on|kneeling)/.test(stance) || posture.confident) {
        const apart =
          legs.length === 2 && Math.abs(legs[0]!.ankle.x - legs[1]!.ankle.x) > 0.5 * ref;
        stance = apart ? 'walking mid-stride' : 'standing';
        if (readLean) stance = `${stance}, ${readLean}`;
      }
    }
  }
  if (!visionStance && !lying && legs.length === 2) {
    const [right, left] = [legs[0]!, legs[1]!];
    const hipHeight = ground - hip.y;
    const kneesOut =
      (right.knee.x - hip.x) * (left.knee.x - hip.x) < 0 &&
      Math.abs(right.knee.x - hip.x) > unit * 0.3 &&
      Math.abs(left.knee.x - hip.x) > unit * 0.3;
    const anklesIn = Math.abs(right.ankle.x - left.ankle.x) < unit * 0.4;
    const bothOnGround = legs.every(leg => leg.ankle.y > ground - unit * 0.2);
    const angles = legs.map(leg => jointAngle(leg.hip, leg.knee, leg.ankle));
    const spread = Math.abs(right.ankle.x - left.ankle.x);
    // Knees above the hips with the shins dropping to the floor is a deep squat, not a
    // cross-legged sit — seen front-on both have low hips, knees out and feet in (CMU crouch
    // references: knees 0.18–0.34 of a torso above the hips; COCO cross-legged sits: level or
    // below).
    const kneeLift = (hip.y - (right.knee.y + left.knee.y) / 2) / unit;
    const shinsDrop = legs.every(leg => leg.ankle.y - leg.knee.y > unit * 0.2);
    if (
      hipHeight < unit * 0.45 &&
      kneesOut &&
      anklesIn &&
      bothOnGround &&
      kneeLift > 0.1 &&
      shinsDrop
    ) {
      stance = `in a deep squat, knees apart, feet flat on the floor`;
    } else if (hipHeight < unit * 0.45 && kneesOut && anklesIn && bothOnGround) {
      stance = `sitting cross-legged on the floor`;
    } else if (
      bothOnGround &&
      spread > unit * 0.9 &&
      Math.min(...angles) < 140 &&
      Math.max(...angles) > 155 &&
      // A wide lunge's bent thigh is level, which the stance reader takes for a seat.
      (/^(?:walking mid-stride|standing|bending forward)/.test(stance) ||
        posture.posture === 'standing' ||
        posture.posture === 'crouching')
    ) {
      const bent = angles[0]! < angles[1]! ? right : left;
      const straight = bent === right ? left : right;
      stance = `in a deep lunge, ${readAs} ${bent.side} knee bent, ${readAs} ${straight.side} leg straight out to the side`;
    }
  }

  // One knee down: "kneeling" alone knelt on both knees on Rapid (2/2) — say where the other
  // foot is and that its knee is up. (A lean the stance reader added is dropped: the knee up
  // in front is what tells.)
  const oneKnee = stance.match(
    /^kneeling on (?:her|his) (right|left) knee, other foot flat on the floor(?:, leaning [^,]+)?$/
  );
  if (oneKnee) {
    const other = oneKnee[1] === 'right' ? 'left' : 'right';
    stance = `on one knee: ${readAs} ${oneKnee[1]} knee down on the floor, ${readAs} ${other} foot planted in front with that knee up`;
  }

  // ── Which way she faces ───────────────────────────────────────────────────────────────
  let view: string | null = null;
  const head = readHeadDirection(body, a);
  if (!lying && rs && ls) {
    const across = ls.x - rs.x; // + facing the camera (her right on the picture's left)
    const shoulderMid = mid(rs, ls);
    if (read.backTurned || across < -unit * 0.14) {
      // Seen from behind her right is the picture's right; a nose out that way looks back
      // over that shoulder.
      const look =
        nose && Math.abs(nose.x - shoulderMid.x) > unit * 0.06
          ? `, looking back over ${readAs} ${nose.x > shoulderMid.x ? 'right' : 'left'} shoulder`
          : '';
      view = `${readAs} back to the camera${look}`;
    } else if (Math.abs(across) < unit * 0.14) {
      const toward = nose && Math.abs(nose.x - neck.x) > unit * 0.04 ? nose.x - neck.x : 0;
      view = toward
        ? `side-on, facing the ${toward < 0 ? 'left' : 'right'} of the picture`
        : 'side-on to the camera';
    } else if (across < unit * 0.36 && nose && Math.abs(nose.x - shoulderMid.x) > unit * 0.05) {
      // Facing the camera her right is the picture's left: a face turned that way is turned
      // to her right.
      view = `turned three-quarters to ${readAs} ${nose.x < shoulderMid.x ? 'right' : 'left'}`;
    }
  }

  // ── Limb facts, in her body's own frame ───────────────────────────────────────────────
  const facts: Fact[] = [];
  const torsoLength = dist(neck, hip);
  // A posture the vision read gave (reclining, sitting…) is often shot from above, its torso
  // foreshortened: the neck-to-hip line still says which way is up for the arms.
  const upright = torsoLength > unit * (visionStance && !visionLying ? 0.2 : 0.5);
  // Bent over or leaning hard, the arms are read in the picture's frame — against gravity, as
  // the eye reads them: in the torso's frame a bend's hanging arms came out "stretched out to
  // the sides" (bend_pick-1, the pose bench), and the engines held them out.
  const gravity =
    !lying &&
    !visionStance &&
    posture.posture !== 'upside-down' &&
    (posture.tiltDeg ?? 0) >= GRAVITY_TILT_DEG;
  const up =
    upright && !gravity
      ? { x: (neck.x - hip.x) / torsoLength, y: (neck.y - hip.y) / torsoLength }
      : { x: 0, y: -1 };
  const side = { x: -up.y, y: up.x };
  const along = (p: Pt) => (p.x - neck.x) * up.x + (p.y - neck.y) * up.y;
  const across = (p: Pt) => (p.x - hip.x) * side.x + (p.y - hip.y) * side.y;
  const headPoint = nose ?? { x: neck.x + up.x * unit * 0.25, y: neck.y + up.y * unit * 0.25 };
  type ArmPose =
    | 'overhead'
    | 'upout'
    | 'head'
    | 'face'
    | 'hip'
    | 'out'
    | 'crossed'
    | 'knee'
    | 'prop'
    | 'held'
    | 'reach-down'
    | 'hang'
    | 'floor'
    | LyingArm;
  const arms: Array<{ side: 'right' | 'left'; pose: ArmPose }> = [];
  if (upright || lying || gravity) {
    for (const [armSide, si, ei, wi, hi] of [
      ['right', 2, 3, 4, 8],
      ['left', 5, 6, 7, 11],
    ] as const) {
      const shoulder = at(si);
      const elbow = at(ei);
      const wrist = at(wi);
      if (!shoulder || !wrist) continue;
      const ownHip = at(hi) ?? hip;
      const sideOut = (p: Pt) => Math.abs(across(p));
      const crossesOver =
        Math.sign(across(wrist)) !== Math.sign(across(shoulder)) &&
        Math.abs(across(wrist)) > unit * 0.06 &&
        along(wrist) < -unit * 0.1 &&
        along(wrist) > -unit * 0.75;
      let pose: ArmPose | null = null;
      const nearHead = dist(wrist, headPoint) < unit * 0.38;
      // In front of the face (a camera, a phone, hands to the cheeks): the hand sits over the
      // nose; behind the head it is out by the ears or above them.
      const overFace =
        !lying &&
        nose != null &&
        Math.abs(across(wrist) - across(nose)) < unit * 0.1 &&
        along(wrist) <= along(nose) + unit * 0.05;
      // Above the face: past the nose, or a clear head's height over the neck.
      const raised = along(wrist) > Math.max(unit * 0.3, nose ? along(nose) + unit * 0.08 : 0);
      if (
        lying &&
        nearHead &&
        elbow &&
        elbow.y > shoulder.y + unit * 0.2 &&
        wrist.y < elbow.y - unit * 0.2
      ) {
        // On an elbow, forearm up, the head resting on the hand.
        pose = 'prop';
      } else if (
        nearHead &&
        elbow &&
        along(elbow) > along(shoulder) - unit * 0.12 &&
        // Flat, a hand behind the head lands over the face: what tells them apart is the elbow,
        // lifted well over the shoulder and out (hands at the cheeks, a phone or a camera keep it
        // at or under the shoulder). The editor's Behind head read "hands at her face" every time.
        (!overFace ||
          (along(elbow) > along(shoulder) + unit * 0.2 && sideOut(elbow) > sideOut(shoulder)))
      ) {
        pose = 'head';
      } else if (lying) {
        // Lying, "up" in her body's frame is along the floor: "reaching up and out" on lie_side-1
        // was drawn as an arm raised to the sky (Turbo and Edit 2511, the pose bench), "both
        // arms raised overhead" on lie_front-2 as arms and legs up on her back (Edit 2511). Her
        // arms are said against her body and the floor instead.
        pose =
          nose && dist(wrist, nose) < unit * 0.3
            ? 'face'
            : lyingArm({ shoulder, wrist, ownHip, unit, along, across });
      } else if (raised && !nearHead) {
        pose = Math.abs(across(wrist) - across(shoulder)) > unit * 0.6 ? 'upout' : 'overhead';
      } else if (nose && dist(wrist, nose) < unit * 0.3) {
        pose = 'face';
      } else if (
        // Elbow lifted over the shoulder, hand up by the head: a stretch, arms up and out.
        elbow &&
        along(elbow) > along(shoulder) + unit * 0.1 &&
        along(wrist) > along(shoulder) + unit * 0.25
      ) {
        pose = Math.abs(across(wrist) - across(shoulder)) > unit * 0.45 ? 'upout' : 'overhead';
      } else if (
        !lying &&
        elbow &&
        dist(wrist, ownHip) < unit * 0.3 &&
        sideOut(elbow) > sideOut(shoulder) + unit * 0.1 &&
        sideOut(elbow) > sideOut(wrist) + unit * 0.1
      ) {
        pose = 'hip';
      } else if (
        !lying &&
        sideOut(wrist) - sideOut(shoulder) > unit * 0.5 &&
        Math.abs(along(wrist) - along(shoulder)) < unit * 0.3
      ) {
        pose = 'out';
      } else if (!lying && crossesOver) {
        pose = 'crossed';
      } else if (legs.some(leg => dist(wrist, leg.knee) < unit * 0.22) && !lying) {
        pose = 'knee';
      } else if (!lying) {
        pose = heldArm(shoulder, elbow, wrist, {
          ref,
          gravity,
          body: [ownHip, ...legs.map(leg => leg.knee)],
          ground: legs.length ? Math.max(...legs.map(leg => leg.ankle.y)) : null,
        });
      }
      if (pose) arms.push({ side: armSide, pose });
    }
  }
  // Lying, one forearm up under the head: on her side, head propped on that hand (the other
  // elbow under the body read as "propped on her elbows", on her front).
  const prop = arms.find(arm => arm.pose === 'prop');
  if (prop) {
    stance = `lying on ${readAs} side, head propped on ${readAs} ${prop.side} hand`;
  } else if (lying && !visionStance) {
    stance = withLyingSupport(stance, {
      at,
      legs,
      kneeAngles,
      neck,
      hip,
      ref,
      tilt: posture.tiltDeg ?? 90,
      whose: readAs,
    });
  }
  // A photo's hand holding something (the vision read): say the thing, not where the joints put
  // the hand — sit-4's umbrella held at the chest read "both hands on hips" (the pose bench).
  const held = heldObjectWords(options.posture?.held);
  if (held) {
    for (let i = arms.length - 1; i >= 0; i -= 1) {
      if (HAND_PLACES.has(arms[i]!.pose)) arms.splice(i, 1);
    }
    facts.push({ text: held, weight: 6.6 });
  }
  const lyingSide = /^lying on (?:her|his) side\b/.test(stance);
  // A plank's arms are its support, already said ("face down on straight arms").
  if (/^in a (?:side )?plank\b/.test(stance)) arms.length = 0;
  const armFact = (pose: ArmPose, both: string, one: (s: string) => string, weight: number) => {
    const hits = arms.filter(arm => arm.pose === pose);
    if (hits.length === 2) facts.push({ text: both, weight: weight + 0.5 });
    else if (hits.length === 1) facts.push({ text: one(hits[0]!.side), weight });
  };
  armFact('overhead', 'both arms raised overhead', s => `${readAs} ${s} arm raised overhead`, 9);
  armFact(
    'upout',
    'both arms raised up and out wide',
    s => `${readAs} ${s} arm reaching up and out`,
    7
  );
  armFact(
    'head',
    `both hands behind ${readAs} head`,
    s => `${readAs} ${s} hand behind ${readAs} head`,
    8
  );
  armFact('face', `both hands at ${readAs} face`, s => `${readAs} ${s} hand at ${readAs} face`, 5);
  armFact('hip', 'both hands on hips', s => `${readAs} ${s} hand on ${readAs} hip`, 6);
  armFact(
    'out',
    'arms stretched out to the sides',
    s => `${readAs} ${s} arm stretched out to the side`,
    6.3
  );
  // Any arm held away from her body is said, ahead of a hand on the hip or a knee: an arm left
  // out of the words was left out of the picture (an arm held out on kneel-2, one reaching to
  // the ground on sit_floor-2, hurdle-3's arm out to the side dropped for "hand on her hip" by
  // the word budget — never drawn on any engine, the pose bench).
  armFact('held', 'both arms held out', s => `${readAs} ${s} arm held out`, 6.3);
  armFact(
    'reach-down',
    'both arms reaching down and out',
    s => `${readAs} ${s} arm reaching down and out`,
    6.1
  );
  armFact(
    'lie-past-head',
    `both arms stretched out along the floor above ${readAs} head`,
    s => `${readAs} ${s} arm stretched out along the floor above ${readAs} head`,
    7
  );
  armFact(
    'lie-raised',
    'both arms raised up in the air',
    s => `${readAs} ${s} arm raised up in the air`,
    7
  );
  armFact(
    'lie-out',
    lyingSide
      ? `both hands down on the floor in front of ${readAs} chest`
      : 'both arms out along the floor',
    s =>
      lyingSide
        ? `${readAs} ${s} hand down on the floor in front of ${readAs} chest`
        : `${readAs} ${s} arm out along the floor beside ${readAs === 'his' ? 'him' : 'her'}`,
    5
  );
  armFact(
    'lie-hip',
    `both hands resting on ${readAs} hips`,
    s => `${readAs} ${s} hand resting on ${readAs} hip`,
    4.5
  );
  if (arms.filter(arm => arm.pose === 'hang').length === 2) {
    facts.push({ text: 'arms hanging down', weight: 4.5 });
  }
  armFact('floor', 'hands down on the floor', s => `${readAs} ${s} hand down on the floor`, 5);
  if (arms.filter(arm => arm.pose === 'crossed').length === 2) {
    facts.push({ text: `arms folded across ${readAs} chest`, weight: 6 });
  }
  // A bend: the stance reader's "hands reaching to the floor" is the arm fact that matters.
  for (const words of read.armWords) {
    if (/reaching to the floor/.test(words)) facts.push({ text: words, weight: 5 });
  }

  // Seated, leaning back: the torso tips away from the knees (seen from the side), or — facing
  // the camera — both hands planted low beside the hips, nearer the hips than the knees.
  if (!lying && /^(?:seated|sitting)/.test(stance) && legs.length) {
    const kneeSide = Math.sign(
      legs.reduce((sum, leg) => sum + leg.knee.x, 0) / legs.length - hip.x
    );
    const lean = neck.x - hip.x;
    const sideLean =
      Math.abs(kneeSide) > 0 &&
      Math.abs(legs.reduce((sum, leg) => sum + leg.knee.x, 0) / legs.length - hip.x) > unit * 0.3 &&
      Math.sign(lean) === -kneeSide &&
      Math.abs(lean) > unit * 0.25;
    const plantedHands = [
      [at(4), rHip],
      [at(7), lHip],
    ].map(([wrist, ownHip]) => {
      if (!wrist || !ownHip) return false;
      const nearestKnee = Math.min(...legs.map(leg => dist(wrist, leg.knee)));
      return (
        wrist.y > hip.y - unit * 0.15 &&
        Math.abs(wrist.x - hip.x) > Math.abs(ownHip.x - hip.x) &&
        dist(wrist, ownHip) < nearestKnee
      );
    });
    if (sideLean || plantedHands.every(Boolean)) {
      const onHands =
        plantedHands.every(Boolean) ||
        [at(4), at(7)].some(
          wrist =>
            wrist && wrist.y > hip.y - unit * 0.12 && Math.sign(wrist.x - hip.x) === -kneeSide
        );
      facts.push({
        text: onHands ? `leaning back on ${readAs} hands` : 'leaning back',
        weight: 7,
      });
      // The hands are already said.
      for (let i = arms.length - 1; i >= 0; i -= 1) {
        if (onHands && arms[i]!.pose === 'knee') arms.splice(i, 1);
      }
    }
  }
  // Hands on a knee: which knee, when both hands rest on the same one (the raised knee of a kneel).
  const kneeOf = (wristIndex: number) => {
    const wrist = at(wristIndex);
    if (!wrist) return null;
    const near = legs
      .map(leg => ({ side: leg.side, d: dist(wrist, leg.knee) }))
      .sort((x, y) => x.d - y.d)[0];
    return near && near.d < unit * 0.22 ? near.side : null;
  };
  const onKnees = arms.filter(arm => arm.pose === 'knee');
  if (onKnees.length === 2) {
    const [first, second] = [kneeOf(4), kneeOf(7)];
    facts.push({
      text:
        first && first === second
          ? `both hands on ${readAs} ${first} knee`
          : `hands on ${readAs} knees`,
      weight: 3.5,
    });
  } else if (onKnees.length === 1) {
    facts.push({ text: `${readAs} ${onKnees[0]!.side} hand on ${readAs} knee`, weight: 3 });
  }
  // Seated, kneeling or reclining by the vision read: the joints' ground is not hers (a body shot
  // from above), so each leg is said in its own frame — bent at the knee or stretched out — and
  // whether the thighs open apart.
  if (visionStance && !visionLying && legs.length) {
    const bentLegs = legs.filter(leg => jointAngle(leg.hip, leg.knee, leg.ankle) < 135);
    const straightLegs = legs.filter(leg => jointAngle(leg.hip, leg.knee, leg.ankle) > 155);
    if (legs.length === 2) {
      const [right, left] = [legs[0]!, legs[1]!];
      const thigh = (leg: (typeof legs)[number]) =>
        Math.atan2(leg.knee.y - leg.hip.y, leg.knee.x - leg.hip.x);
      let open = Math.abs(thigh(right) - thigh(left));
      if (open > Math.PI) open = 2 * Math.PI - open;
      if ((open * 180) / Math.PI > 55) facts.push({ text: 'legs apart', weight: 6.5 });
    }
    for (const leg of bentLegs) {
      facts.push({ text: `${readAs} ${leg.side} knee bent`, weight: 5.5 });
    }
    for (const leg of straightLegs) {
      facts.push({ text: `${readAs} ${leg.side} leg stretched out`, weight: 5 });
    }
  }
  // Legs: knees up when lying, crossed legs, weight on one leg.
  const faceDown = /^(?:lying on (?:her|his) front|face down)/.test(stance);
  if (lying && faceDown) {
    // On the front, shins up: the feet kicked up behind her.
    const feetUp = legs.filter(leg => leg.ankle.y < leg.knee.y - unit * 0.3);
    if (feetUp.length) facts.push({ text: 'feet kicked up behind', weight: 6 });
  } else if (lying && legs.some(leg => leg.ankle.y < leg.hip.y - unit * 0.6)) {
    // On the back with the legs up in the air (a stretch).
    const raised = legs.filter(leg => leg.ankle.y < leg.hip.y - unit * 0.6);
    facts.push({
      text:
        raised.length === 2
          ? 'both legs raised up in the air'
          : `${readAs} ${raised[0]!.side} leg raised up in the air`,
      weight: 7,
    });
  } else if (lying) {
    const up = legs.filter(leg => leg.knee.y < Math.min(leg.hip.y, leg.ankle.y) - unit * 0.18);
    if (up.length === 2) facts.push({ text: 'both knees bent up', weight: 6.5 });
    else if (up.length === 1)
      facts.push({ text: `${readAs} ${up[0]!.side} knee bent up`, weight: 6 });
  }
  if (legs.length === 2 && rHip && lHip && Math.abs(rHip.x - lHip.x) > unit * 0.05) {
    const [right, left] = [legs[0]!, legs[1]!];
    const hipsOrder = Math.sign(rHip.x - lHip.x);
    const anklesCrossed =
      Math.sign(right.ankle.x - left.ankle.x) === -hipsOrder &&
      Math.abs(right.ankle.x - left.ankle.x) > unit * 0.04;
    // Low with the ankles crossed and the knees no higher than the hips is a cross-legged sit;
    // the stance reader calls it "crouching low" (COCO floor sits, 4 of 5).
    if (
      anklesCrossed &&
      /^(?:crouching low|in a (?:deep )?squat)/.test(stance) &&
      (right.knee.y + left.knee.y) / 2 >= hip.y - unit * 0.1
    ) {
      stance = stance.replace(
        /^(?:crouching low|in a deep squat|in a squat, knees bent)/,
        'sitting cross-legged on the floor'
      );
    }
    if (anklesCrossed && !/cross-legged/.test(stance)) {
      facts.push({
        text: /^standing/.test(stance) ? 'one foot crossed over the other' : 'legs crossed',
        weight: 5,
      });
    }
    if (stance === 'standing' && !anklesCrossed) {
      const angles = legs.map(leg => jointAngle(leg.hip, leg.knee, leg.ankle));
      const straightIndex = angles[0]! >= angles[1]! ? 0 : 1;
      const bentIndex = 1 - straightIndex;
      if (
        angles[straightIndex]! > 165 &&
        angles[bentIndex]! < 158 &&
        legs[bentIndex]!.ankle.y < legs[straightIndex]!.ankle.y - unit * 0.03
      ) {
        facts.push({
          text: `weight on ${readAs} ${legs[straightIndex]!.side} leg, ${legs[bentIndex]!.side} knee bent`,
          weight: 4,
        });
      }
    }
  }
  // The head: tipped or turned, when the body faces the camera (a back or side view says it).
  // Weighted above the hands: a turned head is the one thing the engines drop first.
  // Turned three-quarters the head still says what the body doesn't — a profile, chin up, head
  // bowed — unless it is the same three-quarter turn (the editor's Head chips on the Sit figure
  // were dropped every time).
  const bodyQuarter = view?.match(/^turned three-quarters to (?:her|his) (left|right)$/)?.[1];
  const sameQuarter =
    bodyQuarter != null &&
    isThreeQuarterHead(head.direction) &&
    headTurnSide(head.direction!) === bodyQuarter;
  const headFact =
    (!view || (bodyQuarter && !sameQuarter)) && !lying
      ? headDirectionWords(head.direction, readAs)
      : null;
  if (headFact) {
    facts.push({ text: headFact, weight: 6.5 });
  } else if (!view && !lying) {
    const [re, le] = [at(14), at(15)];
    if (re && le) {
      const tilt = (Math.atan2(re.y - le.y, Math.abs(le.x - re.x)) * 180) / Math.PI;
      if (Math.abs(tilt) > 14) {
        // Facing the camera her right eye is on the picture's left; it dips as she tilts right.
        facts.push({ text: `head tilted to ${readAs} ${tilt > 0 ? 'right' : 'left'}`, weight: 4 });
      }
    }
  }

  // The most telling facts that fit, kept in the order they were found (arms, legs, head).
  const budget = maxWords - wordCount(stance) - (view ? wordCount(view) : 0);
  const ranked = [...facts].sort((x, y) => y.weight - x.weight);
  const kept = new Set<Fact>();
  let used = 0;
  for (const fact of ranked) {
    if (kept.size >= MAX_FACTS) break;
    const words = wordCount(fact.text);
    if (used + words > budget) continue;
    kept.add(fact);
    used += words;
  }
  return finish(
    stance,
    view,
    facts.filter(fact => kept.has(fact)).map(fact => fact.text)
  );
}

/**
 * The head as the editor's Head chips set it, in words; null for a front-facing head or one that
 * matches no chip. Sides are hers, with the picture's side and where the face points said too:
 * on Edit 2511 (Day's clothed engine, face-locked to Image 1) "head turned to her left" alone
 * left her facing the camera 4/4, while "head turned to her left, face in profile toward the
 * right of the picture, looking away from the camera" turned it (2026-10-06, wave beat, 2 seeds).
 * `facingCamera` false (a back view) puts her left on the picture's left.
 */
export function headDirectionWords(
  direction: HeadDirection | null,
  possessive: 'her' | 'his' | 'their' = 'her',
  facingCamera = true
): string | null {
  if (!direction || direction === 'straight') return null;
  if (direction === 'up') return 'chin up';
  if (direction === 'down') return 'head bowed';
  const side = headTurnSide(direction);
  if (!side) return null;
  const picture = (side === 'left') === facingCamera ? 'right' : 'left';
  return isThreeQuarterHead(direction)
    ? `head turned three-quarters to ${possessive} ${side}, face angled toward the ${picture} of the picture, eyes off the camera`
    : `head turned to ${possessive} ${side}, face in profile toward the ${picture} of the picture, looking away from the camera`;
}

/** A pose line ending in one of `headDirectionWords`, so a chip's words are said only once. */
const HEAD_WORDS_TAIL_RE =
  /,\s*(?:chin up|head bowed|head turned (?:three-quarters )?to (?:her|his|their) (?:left|right)(?:, face (?:in profile|angled) toward the (?:left|right) of the picture, (?:looking away from|eyes off) the camera)?)\s*$/;

/** The pose words without the head cue a Head chip added (`withHeadWords`). */
export function withoutHeadWords(words: string): string {
  return words.replace(HEAD_WORDS_TAIL_RE, '');
}

/**
 * A named pose's own words with the head the chips set ("waving: one arm raised high, head
 * turned to her left"): the name keeps its A/B'd cue and the head still reaches the prompt.
 */
export function withHeadWords(words: string, head: string | null): string {
  const base = withoutHeadWords(words.trim());
  return head ? `${base}, ${head}` : base;
}

/** COCO-18 joints that say where a named limb is, her right first: wrist / knee / … per noun. */
const SIDE_JOINTS: Array<[RegExp, Array<[number, number]>]> = [
  [
    /^(?:arm|hand|wrist|elbow)$/,
    [
      [4, 7],
      [3, 6],
      [2, 5],
    ],
  ],
  [
    /^(?:knee|thigh)$/,
    [
      [9, 12],
      [8, 11],
    ],
  ],
  [
    /^(?:leg|foot|ankle|shin)$/,
    [
      [10, 13],
      [9, 12],
    ],
  ],
  [/^shoulder$/, [[2, 5]]],
  [/^hip$/, [[8, 11]]],
];

/**
 * After the first "her right <limb>" and the first "her left <limb>", say which side of the
 * picture that limb is on, read from the joints themselves (facing the camera her right is the
 * picture's left; from behind, its right). Skipped when the two sides sit too close to tell
 * (a side-on view) or the joints weren't drawn.
 */
function withPictureSides(text: string, body: NormalizedBody, aspect: number): string {
  const said = new Set<string>();
  return text.replace(
    /\b(her|his) (right|left) (arm|hand|wrist|elbow|knee|thigh|leg|foot|ankle|shin|shoulder|hip)\b/g,
    (match, _whose: string, side: 'right' | 'left', noun: string) => {
      if (said.has(side)) return match;
      const pairs = SIDE_JOINTS.find(([pattern]) => pattern.test(noun))?.[1] ?? [];
      for (const [rightIndex, leftIndex] of pairs) {
        const right = body[rightIndex];
        const left = body[leftIndex];
        if (!right || !left) continue;
        const dx = (right.x - left.x) * aspect;
        if (Math.abs(dx) < 0.03) return match;
        said.add(side);
        // Her right limb on the picture's left when it sits left of her left one.
        const rightOnLeft = dx < 0;
        const picture = (side === 'right') === rightOnLeft ? 'left' : 'right';
        return `${match} (on the ${picture} of the picture)`;
      }
      return match;
    }
  );
}

/** Arm reads that only say where a hand rests — a held thing replaces them. */
const HAND_PLACES = new Set<string>(['hip', 'knee', 'face', 'crossed', 'lie-hip']);

/** Torso tilted this far from upright: the arms are read in the picture's frame. */
const GRAVITY_TILT_DEG = 35;
/** A foot this far (reference lengths) above the other is off the floor. */
const FOOT_OFF_FLOOR = 0.3;

type Leg = { side: 'right' | 'left'; hip: Pt; knee: Pt; ankle: Pt };

/** Angle of a→b from straight down the picture, degrees (0 hanging, 180 straight up). */
function fromDownDeg(a: Pt, b: Pt): number {
  const length = dist(a, b);
  if (length < 1e-9) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (b.y - a.y) / length))) * 180) / Math.PI;
}

/** Lying on the back, side or front, as the posture classifier reads it (posture.ts). */
function lyingStance(posture: PostureClass, whose: 'her' | 'his'): string {
  if (posture === 'lying-front') return `lying on ${whose} front`;
  if (posture === 'lying-side') return `lying on ${whose} side`;
  return `lying on ${whose} back`;
}

/** The knees as the angles say: straight past 160°, slightly bent to 135°, bent under it. */
function kneeWords(kneeAngles: number[]): string {
  if (kneeAngles.length === 0) return 'legs straight';
  const bentest = Math.min(...kneeAngles);
  return bentest >= 160 ? 'legs straight' : bentest < 135 ? 'knees bent' : 'knees slightly bent';
}

/**
 * A bend in words, with the knees as they are: "legs straight" on a deadlift's bent knees
 * (sport_deadlift-2, the pose bench) gave shallow straight-legged bends on every engine. Null
 * keeps the stance reader's words (a lean to one side is not a bend).
 */
function bendStance(input: {
  tilt: number;
  towardCamera: boolean;
  kneeAngles: number[];
  leaningForward: boolean;
}): string | null {
  const knees = kneeWords(input.kneeAngles);
  if (input.towardCamera) return `bent forward at the waist toward the camera, ${knees}`;
  if (input.tilt > 115) return `bent right over at the waist, ${knees}, head down by the knees`;
  if (input.tilt >= 70) return `bent forward at the waist, ${knees}, back level with the floor`;
  if (input.tilt >= 50) return `bent forward at the waist, ${knees}`;
  return input.leaningForward ? `bending forward from the hips, ${knees}` : null;
}

/**
 * Standing with one foot off the floor: a stride or a one-legged pose. A stride keeps the lifted
 * leg near straight, or only just off the floor, or swings it back off a straight standing leg;
 * a one-legged pose raises the knee, kicks, or folds the foot up behind a bent standing knee.
 * Pose references: walk / run read "standing on her left leg, right leg off the floor" 6 of 10
 * with the stance reader alone; jump-4's one-legged stand was rendered on both feet until the
 * words said only one foot is down. Null: both feet are down.
 */
function standingLegs(legs: Leg[], hip: Pt, ref: number, whose: 'her' | 'his'): string | null {
  if (legs.length !== 2) return null;
  const support = legs[0]!.ankle.y >= legs[1]!.ankle.y ? legs[0]! : legs[1]!;
  const other = support === legs[0] ? legs[1]! : legs[0]!;
  const lift = (support.ankle.y - other.ankle.y) / ref;
  if (lift < FOOT_OFF_FLOOR) return null;
  const otherAngle = jointAngle(other.hip, other.knee, other.ankle);
  const supportAngle = jointAngle(support.hip, support.knee, support.ankle);
  const kneeRaised = other.knee.y < support.knee.y - 0.25 * ref || other.knee.y < hip.y + 0.3 * ref;
  const stride =
    !kneeRaised &&
    lift < 0.8 &&
    (otherAngle >= 150 || lift < 0.35 || (supportAngle >= 170 && lift < 0.5));
  if (stride) return `walking mid-stride, ${whose} ${other.side} foot off the floor`;
  const them = whose === 'his' ? 'him' : 'her';
  const sideways = Math.abs(other.ankle.x - hip.x) > 0.6 * ref;
  const lifted =
    kneeRaised && otherAngle < 110
      ? `${whose} ${other.side} knee raised high`
      : other.ankle.y < hip.y - 0.1 * ref
        ? `${whose} ${other.side} leg kicked up high${sideways ? ' to the side' : ''}`
        : sideways && otherAngle > 100
          ? `${whose} ${other.side} leg kicked out to the side`
          : kneeRaised
            ? `${whose} ${other.side} knee raised`
            : otherAngle < 150
              ? `${whose} ${other.side} foot lifted off the floor behind ${them}, knee bent`
              : `${whose} ${other.side} foot lifted off the floor`;
  return `standing on only ${whose} ${support.side} foot, ${lifted}`;
}

/**
 * An arm none of the named reads caught, read against gravity: held out (55° or more off
 * straight down), reaching down and out (40–55°, straight, clear of her body), or — bent over —
 * hanging, or down on the floor. Null: an arm at rest by her side.
 */
function heldArm(
  shoulder: Pt,
  elbow: Pt | null,
  wrist: Pt,
  input: { ref: number; gravity: boolean; body: Pt[]; ground: number | null }
): 'held' | 'reach-down' | 'hang' | 'floor' | null {
  const { ref, gravity } = input;
  const angle = fromDownDeg(shoulder, wrist);
  if (gravity && angle < 30) {
    return input.ground !== null && input.ground - wrist.y < 0.4 * ref ? 'floor' : 'hang';
  }
  // The arm's far end: the wrist, or — the forearm folded back toward the shoulder — the elbow,
  // when it is the part held away (sit_floor-2's arm reaching down to the ground, its wrist
  // drawn folded back: never said on any engine, the pose bench).
  const folded =
    elbow != null &&
    dist(shoulder, wrist) < 0.5 * ref &&
    dist(shoulder, elbow) >= 0.5 * ref &&
    dist(shoulder, elbow) > dist(shoulder, wrist);
  const end = folded ? elbow : wrist;
  const reach = dist(shoulder, end);
  if (reach < 0.5 * ref) return null;
  const endAngle = folded ? fromDownDeg(shoulder, end) : angle;
  // A folded arm with the elbow up and out is a hand behind the head or a guard, not held out.
  if (folded && endAngle >= 55) return null;
  if (endAngle >= 55) return 'held';
  const straight = folded || !elbow || jointAngle(shoulder, elbow, wrist) > 140;
  const clear = input.body.every(point => dist(end, point) > 0.35 * ref);
  // Down and out: 40° off straight down, or 30° when the hand is clearly out past the shoulder.
  const outPastShoulder = Math.abs(end.x - shoulder.x) > 0.3 * ref;
  return (endAngle >= 40 || (endAngle >= 30 && outPastShoulder)) && straight && clear
    ? 'reach-down'
    : null;
}

type LyingArm = 'lie-past-head' | 'lie-raised' | 'lie-out' | 'lie-hip';

/**
 * A lying figure's arm, against her body and the floor — never "up", which the engines drew as
 * an arm raised to the sky (lie_side-1, Turbo and Edit 2511, the pose bench): stretched out along
 * the floor past her head, raised in the air (the hand well above the shoulder in the picture
 * and not along her body), a hand resting on her hip, or out on the floor away from her body.
 * Null: an arm along her side.
 */
function lyingArm(input: {
  shoulder: Pt;
  wrist: Pt;
  ownHip: Pt;
  unit: number;
  along: (p: Pt) => number;
  across: (p: Pt) => number;
}): LyingArm | null {
  const { shoulder, wrist, ownHip, unit, along, across } = input;
  const pastHead = along(wrist) - along(shoulder);
  const rise = shoulder.y - wrist.y;
  if (rise > unit * 0.45 && rise > Math.abs(pastHead)) return 'lie-raised';
  if (pastHead > unit * 0.3) return 'lie-past-head';
  if (dist(wrist, ownHip) < unit * 0.35) return 'lie-hip';
  if (Math.abs(across(wrist)) - Math.abs(across(shoulder)) > unit * 0.35) return 'lie-out';
  return null;
}

/**
 * Lying, what holds her up: a plank (legs straight, hips off the floor, on straight arms or the
 * forearms planted on the feet's floor — read before the lying side, which a plank's face-down
 * body often misses), propped on the elbows on her front, or reclining back on them.
 */
function withLyingSupport(
  stance: string,
  input: {
    at: (i: number) => Pt | null;
    legs: Leg[];
    kneeAngles: number[];
    neck: Pt;
    hip: Pt;
    ref: number;
    tilt: number;
    whose: 'her' | 'his';
  }
): string {
  const { at, legs, kneeAngles, neck, hip, ref, tilt, whose } = input;
  if (/\bhead propped\b/.test(stance)) return stance;
  const arms = (
    [
      ['right', 2, 3, 4],
      ['left', 5, 6, 7],
    ] as const
  ).flatMap(([side, si, ei, wi]) => {
    const [s, e, w] = [at(si), at(ei), at(wi)];
    return s && e && w ? [{ side, s, e, w }] : [];
  });
  const lowestFoot = legs.length ? Math.max(...legs.map(leg => leg.ankle.y)) : null;
  if (
    lowestFoot !== null &&
    legs.length === 2 &&
    kneeAngles.every(angle => angle > 150) &&
    tilt < 84 &&
    lowestFoot - hip.y > 0.2 * ref
  ) {
    const onFloor = (p: Pt) => Math.abs(p.y - lowestFoot) < 0.3 * ref;
    const straight = arms.filter(
      arm =>
        jointAngle(arm.s, arm.e, arm.w) > 150 &&
        arm.w.y - arm.s.y > 0.45 * ref &&
        fromDownDeg(arm.s, arm.w) < 30 &&
        onFloor(arm.w)
    );
    const forearms = arms.filter(
      arm => arm.e.y - arm.s.y > 0.2 * ref && onFloor(arm.e) && onFloor(arm.w)
    );
    const raised = arms.find(arm => arm.w.y < arm.s.y - 0.2 * ref);
    if (straight.length === 1 && raised) {
      return `in a side plank on ${whose} ${straight[0]!.side} arm, ${whose} ${raised.side} arm raised`;
    }
    if (straight.length > 0) return 'in a plank, face down on straight arms';
    if (forearms.length > 0) return `in a plank, face down on ${whose} forearms`;
  }
  const elbowsDown = arms.filter(arm => arm.e.y > arm.s.y + 0.2 * ref);
  const nose = at(0);
  if (/^lying on (?:her|his) front$/.test(stance)) {
    return elbowsDown.length === 2 && nose && nose.y < neck.y - 0.1 * ref
      ? `${stance}, propped on ${whose} elbows`
      : stance;
  }
  // On the back with the chest raised: reclining on the elbows.
  if (/^lying on (?:her|his) back$/.test(stance) && tilt < 72 && elbowsDown.length > 0) {
    return elbowsDown.length === 2
      ? `${stance}, propped up on ${whose} elbows`
      : `${stance}, propped up on ${whose} ${elbowsDown[0]!.side} elbow`;
  }
  return stance;
}

/**
 * A custom pose in words, ready for a prompt: one person's description, or two — the lead
 * first, each said where they stand in the picture. A pose known by name (a Day pose picked from
 * the list) keeps its own words: the joints of a Day-drawn figure misread (a walk as one-legged,
 * a sit as a squat).
 */
export function describePhotoPose(
  photo: PhotoPose,
  options: Omit<PoseDescribeOptions, 'aspect' | 'possessive'> & {
    /** The lead's pronoun. The partner's limbs are 'their'. */
    lead?: 'she' | 'he';
  } = {}
): string {
  const people = photo.people.filter(body => body.some(Boolean));
  if (people.length === 0) return '';
  const possessive = options.lead === 'he' ? 'his' : 'her';
  if (people.length === 1) {
    if (photo.words?.trim()) return photo.words.trim().replace(/[.\s]+$/, '');
    return describePoseFigure(people[0]!, {
      ...options,
      aspect: photo.aspect,
      possessive,
      ...(photo.posture ? { posture: photo.posture } : {}),
    }).text;
  }
  const [lead, partner] = [people[0]!, people[1]!];
  const leadX = bodyCentreX(lead) ?? 0.4;
  const partnerX = bodyCentreX(partner) ?? 0.6;
  const leadSide = leadX <= partnerX ? 'left' : 'right';
  const partnerSide = leadSide === 'left' ? 'right' : 'left';
  const pronoun = options.lead === 'he' ? 'he' : 'she';
  const each = {
    ...options,
    aspect: photo.aspect,
    maxWords: options.maxWords ?? POSE_WORDS_DUO_MAX,
    pictureSides: false,
  };
  const leadWords = describePoseFigure(lead, { ...each, possessive }).text;
  const partnerWords = describePoseFigure(partner, { ...each, possessive: 'their' }).text;
  return `${pronoun} is on the ${leadSide}, ${leadWords}; the partner is on the ${partnerSide}, ${partnerWords}`;
}

/** The prompt's first pose line for a brief ("POSE FIRST: she is …."). */
export function customPoseFirstLine(words: string, lead: 'she' | 'he' = 'she'): string {
  const text = words.trim().replace(/[.\s]+$/, '');
  if (!text) return '';
  return /^(?:she|he) is on the (?:left|right),/.test(text)
    ? `POSE FIRST: ${text}.`
    : `POSE FIRST: ${lead} is ${text}.`;
}

/**
 * A compact recipe with the custom pose as its "Pose:" sentence, where a named layout's cue
 * goes (`withRecipePoseCue`): replaces one that is there, else before "Place:" / after the
 * Moment, else the pose line leads the prompt.
 */
export function withCustomPoseSentence(prompt: string, words: string, lead: 'she' | 'he' = 'she') {
  const text = words.trim().replace(/[.\s]+$/, '');
  if (!text) return prompt;
  const sentence = `Pose: ${text}.`;
  if (/\bPose: [^\n]*?\.(?= |$)/.test(prompt)) {
    return prompt.replace(/\bPose: [^\n]*?\.(?= |$)/, sentence);
  }
  if (prompt.includes(' Place: ')) return prompt.replace(' Place: ', ` ${sentence} Place: `);
  if (prompt.includes(' Moment: ')) {
    return prompt.replace(/( Moment: [^\n]*?\.)(?= |$)/, `$1 ${sentence}`);
  }
  return `${customPoseFirstLine(text, lead)}\n${prompt}`;
}

/**
 * The words for a still's custom pose, or '' when it has none: described from the figures as the
 * guide drew them (fitted to the still's canvas, the solo cut applied), keeping a named pose's
 * own words.
 */
export function customPoseWords(input: {
  photo: PhotoPose | null | undefined;
  /** The guide's keypoints and canvas aspect, when it was drawn. */
  drawn?: { keypoints: NormalizedBody[]; aspect: number } | null;
  sceneText?: string | null;
  lead?: 'she' | 'he';
}): string {
  const photo = input.photo;
  if (!photo?.people.length) return '';
  const drawn = input.drawn?.keypoints.length ? input.drawn : null;
  const people = drawn ? drawn.keypoints : photo.people;
  return describePhotoPose(
    {
      aspect: drawn ? drawn.aspect : photo.aspect,
      people,
      // A name only describes the one figure it was picked as; so does a photo's posture read.
      ...(photo.words && people.length === 1 ? { words: photo.words } : {}),
      ...(photo.posture && people.length === 1 ? { posture: photo.posture } : {}),
    },
    { sceneText: input.sceneText, lead: input.lead }
  );
}
