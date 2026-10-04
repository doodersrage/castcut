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

import type { PhotoPose } from '@/lib/day-pose-guide';
import type { NormalizedBody } from '@/lib/pose-library';
import { readHeadDirection } from '@/lib/pose-limb-presets';
import { classifyPosture } from '@/lib/pose-posture';
import { bodyCentreX, readPoseStance } from '@/lib/pose-starters';

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
        : text;
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
  const lying = read.stance === 'lying down' || posture.group === 'lying';
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
  let stance = read.stance;
  const [rs, ls] = [at(2), at(5)];
  const nose = at(0);
  if (lying) {
    stance = lyingStance(posture.posture, readAs, { neck, hip, nose, rs, ls, unit, at });
  } else if (posture.posture === 'all-fours' && !/hands and knees/.test(stance)) {
    stance = 'on all fours';
  } else if (posture.posture === 'upside-down') {
    stance = 'upside down, in a handstand';
  }
  if (!lying && legs.length === 2) {
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
      (/^(?:walking mid-stride|standing)/.test(stance) ||
        posture.posture === 'standing' ||
        posture.posture === 'crouching')
    ) {
      const bent = angles[0]! < angles[1]! ? right : left;
      const straight = bent === right ? left : right;
      stance = `in a deep lunge, ${readAs} ${bent.side} knee bent, ${readAs} ${straight.side} leg straight out to the side`;
    }
  }

  // One knee down: "kneeling" alone knelt on both knees on Rapid (2/2) — say where the other
  // foot is and that its knee is up.
  const oneKnee = stance.match(
    /^kneeling on (?:her|his) (right|left) knee, other foot flat on the floor$/
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
  const upright = torsoLength > unit * 0.5;
  const up = upright
    ? { x: (neck.x - hip.x) / torsoLength, y: (neck.y - hip.y) / torsoLength }
    : { x: 0, y: -1 };
  const side = { x: -up.y, y: up.x };
  const along = (p: Pt) => (p.x - neck.x) * up.x + (p.y - neck.y) * up.y;
  const across = (p: Pt) => (p.x - hip.x) * side.x + (p.y - hip.y) * side.y;
  const headPoint = nose ?? { x: neck.x + up.x * unit * 0.25, y: neck.y + up.y * unit * 0.25 };
  type ArmPose =
    'overhead' | 'upout' | 'head' | 'face' | 'hip' | 'out' | 'crossed' | 'knee' | 'prop';
  const arms: Array<{ side: 'right' | 'left'; pose: ArmPose }> = [];
  if (upright || lying) {
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
      } else if (nearHead && !overFace && elbow && along(elbow) > along(shoulder) - unit * 0.12) {
        pose = 'head';
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
      }
      if (pose) arms.push({ side: armSide, pose });
    }
  }
  // Lying, one forearm up under the head: on her side, head propped on that hand (the other
  // elbow under the body read as "propped on her elbows", on her front).
  const prop = arms.find(arm => arm.pose === 'prop');
  if (prop) {
    stance = `lying on ${readAs} side, head propped on ${readAs} ${prop.side} hand`;
  } else if (lying && /^lying on (?:her|his) front/.test(stance)) {
    // Face down on straight arms (a push-up), not on the forearms.
    const straightArms = (
      [
        [2, 3, 4],
        [5, 6, 7],
      ] as const
    ).every(([si, ei, wi]) => {
      const [s, e, w] = [at(si), at(ei), at(wi)];
      return Boolean(
        s &&
        e &&
        w &&
        w.y > e.y &&
        e.y > s.y &&
        jointAngle(s, e, w) > 150 &&
        w.y - s.y > unit * 0.45
      );
    });
    if (straightArms) stance = `face down, body raised on straight arms`;
  }
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
    6
  );
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
      /^crouching low/.test(stance) &&
      (right.knee.y + left.knee.y) / 2 >= hip.y - unit * 0.1
    ) {
      stance = stance.replace(/^crouching low/, 'sitting cross-legged on the floor');
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
  if (!view && !lying && head.direction && head.direction !== 'straight') {
    facts.push({
      text:
        head.direction === 'up'
          ? 'chin up'
          : head.direction === 'down'
            ? 'head bowed'
            : `head turned to ${readAs} ${head.direction}`,
      weight: 4,
    });
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

/** Lying on the back, side or front, from the shoulders and the face. */
function lyingStance(
  posture: string,
  whose: 'her' | 'his',
  input: {
    neck: Pt;
    hip: Pt;
    nose: Pt | null;
    rs: Pt | null;
    ls: Pt | null;
    unit: number;
    at: (i: number) => Pt | null;
  }
): string {
  if (posture === 'lying-front') return `lying on ${whose} front, propped on ${whose} elbows`;
  const { neck, hip, nose, rs, ls, unit, at } = input;
  // Across the body: which way the face points (up off the floor = on the back).
  const axis = { x: neck.x - hip.x, y: neck.y - hip.y };
  const length = Math.hypot(axis.x, axis.y) || 1;
  const normal = { x: -axis.y / length, y: axis.x / length };
  const ears = [at(16), at(17)].filter(Boolean) as Pt[];
  const headMiddle = ears.length
    ? {
        x: ears.reduce((sum, p) => sum + p.x, 0) / ears.length,
        y: ears.reduce((sum, p) => sum + p.y, 0) / ears.length,
      }
    : null;
  const faceUp =
    nose && headMiddle
      ? -((nose.x - headMiddle.x) * normal.x + (nose.y - headMiddle.y) * normal.y) *
        Math.sign(normal.y || 1)
      : 0;
  const stacked = rs && ls ? dist(rs, ls) < unit * 0.35 : true;
  if (!stacked) {
    // Shoulders one above the other in the picture: on her side, front or back to us.
    return `lying on ${whose} side`;
  }
  if (faceUp < -unit * 0.03) return `lying on ${whose} front`;
  return `lying on ${whose} back`;
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
      // A name only describes the one figure it was picked as.
      ...(photo.words && people.length === 1 ? { words: photo.words } : {}),
    },
    { sceneText: input.sceneText, lead: input.lead }
  );
}
