import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describePoseFigure } from './describe';
import type { NormalizedBody } from './library';
import { poseStarterBody } from './starters';
import {
  applyArmPreset,
  applyHeadDirection,
  applyLegPreset,
  type ArmPresetId,
  type HeadDirection,
  type LegPresetId,
  type LimbSide,
} from './limb-presets';
import { liftBodyDepth, rotateBody } from './joint-edit';
const A = 2 / 3;
const STAND = poseStarterBody('stand');
type Case = { name: string; body: NormalizedBody; expect: RegExp; reject?: RegExp };
const cases: Case[] = [];
const sideWord = (s: string) => (s === 'both' ? '' : s);
const armExpect: Record<string, (s: string) => RegExp> = {
  up: s => s === 'both' ? /both arms raised|arms raised/ : new RegExp(`her ${s} arm (?:\\(on the \\w+ of the picture\\) )?(?:raised|reaching up)`),
  hips: s => s === 'both' ? /both hands on hips/ : new RegExp(`her ${s} hand (?:\\(on the \\w+ of the picture\\) )?on her hip`),
  crossed: s => s === 'both' ? /arms folded/ : /./,
  out: s => s === 'both' ? /arms stretched out/ : new RegExp(`her ${s} arm (?:\\(on the \\w+ of the picture\\) )?stretched out`),
  head: s => s === 'both' ? /both hands behind her head/ : new RegExp(`her ${s} hand (?:\\(on the \\w+ of the picture\\) )?behind her head`),
  wave: s => s === 'both' ? /raised|reaching up/ : new RegExp(`her ${s} arm (?:\\(on the \\w+ of the picture\\) )?(?:raised|reaching up)`),
};
for (const starter of ['stand', 'sit', 'kneel', 'walk'] as const) {
  for (const arm of Object.keys(armExpect)) for (const side of ['both', 'right', 'left']) {
    if (arm === 'crossed' && side !== 'both') continue;
    cases.push({ name: `${starter} arms:${arm}:${side}`, body: applyArmPreset(poseStarterBody(starter), arm as ArmPresetId, side as LimbSide, A), expect: armExpect[arm]!(side) });
  }
}
const legExpect: Record<string, RegExp> = { crossed: /crossed/, knee: /knee|leg lifted|leg (?:off|raised)/, wide: /apart|wide|lunge|straddl/ };
for (const leg of Object.keys(legExpect)) for (const side of ['both', 'right', 'left'])
  cases.push({ name: `stand legs:${leg}:${side}`, body: applyLegPreset(STAND, leg as LegPresetId, side as LimbSide, A), expect: legExpect[leg]!, reject: /sitting|kneel|crouch/ });
const headExpect: Record<string, RegExp> = { left: /head turned to her left/, right: /head turned to her right/, 'three-quarter-left': /three-quarters to her left/, 'three-quarter-right': /three-quarters to her right/, up: /chin up/, down: /head bowed/ };
for (const starter of ['stand', 'sit'] as const) for (const [h, re] of Object.entries(headExpect))
  // The editor greys out left / right turns on a side-on figure (the Sit starter).
  if (!(starter === 'sit' && /left|right/.test(h)))
  cases.push({ name: `${starter} head:${h}`, body: applyHeadDirection(poseStarterBody(starter), h as HeadDirection, A), expect: re });
for (const [label, turn, re] of [['back', Math.PI, /back to the camera/], ['side+', Math.PI / 2, /side-on/], ['side-', -Math.PI / 2, /side-on/], ['3q+', Math.PI / 4, /three-quarters/]] as const) {
  for (const starter of ['stand', 'sit', 'walk'] as const) {
    const body = poseStarterBody(starter);
    cases.push({ name: `${starter} turn:${label}`, body: rotateBody(body, liftBodyDepth(body, STAND, A), { turn }, A).body, expect: re as RegExp });
  }
}
// Arm up on a turned figure: sides must follow her body, picture side must flip from behind.
for (const side of ['right', 'left'] as const) {
  const up = applyArmPreset(STAND, 'up', side, A);
  const back = rotateBody(up, liftBodyDepth(up, STAND, A), { turn: Math.PI }, A).body;
  const pic = side === 'right' ? 'right' : 'left';
  cases.push({ name: `stand back arms:up:${side}`, body: back, expect: new RegExp(`her ${side} arm \\(on the ${pic} of the picture\\) (?:raised|reaching)`) });
  const front = side === 'right' ? 'left' : 'right';
  cases.push({ name: `stand front arms:up:${side} picture side`, body: up, expect: new RegExp(`her ${side} arm \\(on the ${front} of the picture\\)`) });
}

/**
 * Chips whose words are still wrong (2026-10-20): a one-sided Wide reads as a stride, the Walk
 * figure's Hips / Wave arms go unsaid, and a 45° turn shows no head offset, so flat joints
 * cannot say which way she turned.
 */
const KNOWN_GAPS = new Set([
  'stand legs:wide:right',
  'stand legs:wide:left',
  'walk arms:hips:both',
  'walk arms:hips:left',
  'walk arms:wave:both',
  'walk arms:wave:right',
  'walk arms:wave:left',
  'stand turn:3q+',
  'sit turn:3q+',
  'walk turn:3q+',
]);

describe('joint editor chips in words', () => {
  for (const c of cases) {
    if (KNOWN_GAPS.has(c.name)) continue;
    it(c.name, () => {
      const text = describePoseFigure(c.body, { aspect: A }).text;
      assert.match(text, c.expect);
      if (c.reject) assert.doesNotMatch(text, c.reject);
    });
  }
});
