/**
 * The custom-pose words against every one-person pose reference (public/pose-references.json):
 * each pose family must come out with its own posture words — on her back / side / front, squat,
 * kneel, sitting, bent with the knees as they are, a stride never a one-legged stand — and the
 * limbs the pose bench saw the engines drop (scripts/pose-bench, 2026-10) must be said.
 *
 * A few references are ambiguous in 2D or mislabelled; they are listed in EXCEPTIONS with why,
 * rather than bending the rules to fit them. The test fails when a new reference fails, and when
 * an exception starts passing (so the list cannot rot).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { describePhotoPose } from './describe';
import type { NormalizedBody } from './library';

type Ref = { id: string; pose: string; aspect: number; people: NormalizedBody[] };

const refs = (
  JSON.parse(readFileSync(join(process.cwd(), 'public/pose-references.json'), 'utf8')) as {
    references: Ref[];
  }
).references.filter(ref => ref.people.length === 1);

/** Hip–knee–ankle angle of each drawn leg, degrees (true sideways distances). */
function kneeAngles(ref: Ref): number[] {
  const body = ref.people[0]!;
  const at = (i: number) => (body[i] ? { x: body[i]!.x * ref.aspect, y: body[i]!.y } : null);
  const out: number[] = [];
  for (const [h, k, a] of [
    [8, 9, 10],
    [11, 12, 13],
  ] as const) {
    const [hip, knee, ankle] = [at(h), at(k), at(a)];
    if (!hip || !knee || !ankle) continue;
    const u = { x: hip.x - knee.x, y: hip.y - knee.y };
    const v = { x: ankle.x - knee.x, y: ankle.y - knee.y };
    const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) || 1);
    out.push((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
  }
  return out;
}

const UPRIGHT = new Set([
  'stand',
  'wave',
  'point',
  'phone',
  'pockets',
  'cross_arms',
  'hands_hips',
  'hair_touch',
  'shrug',
  'look_back',
  'reach',
  'arms_up',
  'hands_behind_head',
  'selfie',
  'photograph',
  'cook',
  'eat',
  'drink',
  'read',
  'carry',
  'lean_wall',
  'lean',
]);
const NOT_UPRIGHT = /\b(?:sitting|seated|kneel\w*|lying|squat\w*|crouch\w*|on all fours)\b/;
const ONE_LEGGED =
  /\bstanding on (?:her|one|only her) (?:right |left )?(?:leg|foot)\b|\b(?:foot|leg) only\b/;

/** What a reference's words must (and must not) say; null when they pass. */
function fault(ref: Ref, said: string): string | null {
  // The picture sides are clarifications ("her left foot (on the right of the picture)").
  const words = said.replace(/ \(on the (?:left|right) of the picture\)/g, '');
  const need = (pattern: RegExp, what: string) => (pattern.test(words) ? null : `no ${what}`);
  const ban = (pattern: RegExp, what: string) => (pattern.test(words) ? what : null);
  const family = ref.pose;
  const checks: Array<string | null> = [];
  if (family === 'lie') checks.push(need(/\bon her back\b/, '"on her back"'));
  if (family === 'lie_side') checks.push(need(/\bon her side\b/, '"on her side"'));
  if (family === 'lie_front') checks.push(need(/\bon her front\b|\bface down\b/, '"on her front"'));
  if (family === 'lounge_elbows') checks.push(need(/\belbows?\b/, 'propped on the elbows'));
  if (family === 'sport_plank' || family === 'sport_pushup') {
    checks.push(need(/\bplank\b|\bpush-up\b|\bface down\b|\bstraight arms\b/, 'a plank'));
  }
  if (family === 'sport_swim') checks.push(need(/\blying\b|\bface down\b/, 'lying'));
  if (family === 'sport_squat') checks.push(need(/\bsquat/, '"squat"'));
  if (family === 'crouch') checks.push(need(/\bsquat|\bcrouch/, '"squat"'));
  if (family === 'kneel') checks.push(need(/\bkneel|\bon one knee\b/, '"kneel"'));
  if (family === 'sport_lunge') checks.push(need(/\blunge\b|\bkneel|\bon one knee\b/, 'a lunge'));
  if (family === 'sport_yoga_warrior') checks.push(need(/\blunge\b/, 'a lunge'));
  if (['sit', 'perch_edge', 'laptop', 'sit_floor'].includes(family)) {
    checks.push(need(/\bsitting\b|\bseated\b/, '"sitting"'));
  }
  if (family === 'walk' || family === 'run') checks.push(ban(ONE_LEGGED, 'a stride read one-legged'));
  if (family === 'sport_handstand') checks.push(need(/\bhandstand\b|\bupside down\b/, 'handstand'));
  if (family === 'sport_yoga_dog') checks.push(need(/\bbent\b|\bbending\b/, '"bent"'));
  if (family === 'stand') checks.push(need(/^standing\b/, '"standing"'));
  if (UPRIGHT.has(family)) checks.push(ban(NOT_UPRIGHT, 'an upright pose read low'));
  if (family === 'bend_pick' || family === 'sport_deadlift') {
    checks.push(need(/\bbent\b|\bbending\b/, '"bent"'));
    const angles = kneeAngles(ref);
    const bentest = Math.min(...angles);
    if (bentest < 135) {
      checks.push(need(/\bknees? (?:\w+ )?bent\b/, 'bent knees'));
    }
    if (bentest < 160) checks.push(ban(/\blegs straight\b/, '"legs straight" on bent knees'));
    else checks.push(ban(/\bknees? (?:\w+ )?bent\b/, 'bent knees on straight legs'));
    // Hanging arms are not held out: the arms are read against gravity when she bends.
    checks.push(ban(/\bstretched out to the sides?\b/, 'hanging arms read as out to the side'));
  }
  // The limbs the bench saw dropped (or misread) — each said, concisely.
  if (ref.id === 'jump-4') {
    checks.push(need(/\bonly her left foot\b|\bleft (?:foot|leg) only\b/, 'one foot only'));
    checks.push(need(/\bright foot (?:lifted )?off the floor\b/, 'the lifted foot'));
  }
  if (ref.id === 'sit_floor-2') checks.push(need(/\bher right arm\b/, 'the reaching right arm'));
  if (ref.id === 'kneel-2') checks.push(need(/\bher right arm\b/, 'the right arm held out'));
  if (ref.id === 'sport_hurdle-3') {
    checks.push(need(/\bher left arm\b[^,]*\bout\b/, 'the left arm held out to the side'));
  }
  // Lying, an arm is said against her body and the floor: "up" was drawn raised to the sky.
  if (/^(?:lie|lie_side|lie_front)-\d$/.test(ref.id)) {
    checks.push(ban(/\barm (?:reaching up|raised overhead)|\barms raised (?:up|overhead)/, 'a lying arm said "up"'));
  }
  if (ref.id === 'sport_stick-3') checks.push(ban(/\bkneel/, 'a standing crouch read kneeling'));
  const found = checks.filter((check): check is string => check !== null);
  return found.length ? found.join('; ') : null;
}

/**
 * References whose words are allowed to miss, each looked at on a skeleton sheet
 * (scripts/pose-bench/refs_sheet.py).
 */
const EXCEPTIONS: Record<string, string> = {
  'kneel-5':
    'COCO kneel whose right leg folds out sideways at hip height (knee 0.18 of the body below the hip, the left leg straight and planted): no knee is near the floor in 2D; reads as a squat',
  'lie_side-3':
    'CMU on-the-side clip with the face turned up (nose above the ear): reads as on her back — the 2D cue that tells the other nine apart points the wrong way here',
  'sport_deadlift-1':
    'labelled deadlift but upright mid-stride (torso 28° off vertical, knees 156°/174°): nothing to bend',
  'sport_deadlift-3':
    'sumo deadlift seen front-on: the bend is toward the camera with the thighs, not the torso, foreshortened — the same 2D shape as sitting facing the camera',
  'sport_deadlift-5':
    'labelled deadlift but standing straight at the lockout (torso 9°, knees 177–179°)',
};

describe('custom pose words over every one-person reference', () => {
  const results = refs.map(ref => {
    const words = describePhotoPose({ aspect: ref.aspect, people: ref.people });
    return { ref, words, fault: fault(ref, words) };
  });

  it('says each family in its own words (exceptions documented)', () => {
    const failing = results.filter(result => result.fault);
    if (process.env.POSE_WORDS_REPORT) {
      console.log(
        `pose words: ${results.length - failing.length}/${results.length} references pass`
      );
      for (const result of failing) {
        console.log(`  ${result.ref.id}: ${result.fault} — "${result.words}"`);
      }
    }
    const unexpected = failing
      .filter(result => !(result.ref.id in EXCEPTIONS))
      .map(result => `${result.ref.id}: ${result.fault} — "${result.words}"`);
    assert.deepEqual(unexpected, []);
    const stale = Object.keys(EXCEPTIONS).filter(
      id => results.some(result => result.ref.id === id) && !failing.some(r => r.ref.id === id)
    );
    assert.deepEqual(stale, [], 'exceptions that now pass: take them off the list');
  });
});
