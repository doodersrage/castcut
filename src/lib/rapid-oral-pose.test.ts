import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS,
  DAY_SLOT_INTIMATE_BEAT_PRESETS,
  DAY_SLOT_RAUNCHY_BEAT_PRESETS,
} from './day-planner';
import { parseIntimateLayout, resolveSceneGuidePlan } from './day-pose-guide';
import { planDaySlotPose } from './day-slot-pose';
import { buildRapidDuoRecipe } from './rapid-duo-recipe';
import { oralReceiverSeated } from './rapid-oral-pose';

const RAPID = 'qwen-rapid-aio-edit-nsfw';

function guideFor(beat: string, model = RAPID) {
  const plan = planDaySlotPose({
    slot: { id: 'afternoon', sceneHints: beat, location: 'apartment' } as never,
    dayMood: 'intimate',
    intimateMix: 'duo',
    model,
  });
  return {
    plan,
    resolved: resolveSceneGuidePlan(plan.sceneText, 0, { ...plan.options, openPose: true }),
  };
}

describe('seated oral pose map', () => {
  it('seats the receiver on an edge with the giver kneeling between her knees', () => {
    // Castcut_02298: a 69 beat on Rapid — the recipe seats her on the edge of the couch.
    const { resolved } = guideFor('sixty-nine on the couch in afternoon light — both adults fully visible');
    assert.equal(resolved.intent.intimate, 'oral');
    const [receiver, giver] = resolved.figures;
    assert.ok(receiver && giver);
    const kneeY = (receiver.lKnee.y + receiver.rKnee.y) / 2;
    // Hips at seat height, level with or above her knees; shins straight down below them.
    assert.ok(receiver.pelvis.y > 0.45 && receiver.pelvis.y < 0.65, `hips ${receiver.pelvis.y}`);
    assert.ok(receiver.pelvis.y <= kneeY + 0.02, 'hips at or above knee level');
    for (const [knee, ankle] of [
      [receiver.lKnee, receiver.lAnkle],
      [receiver.rKnee, receiver.rAnkle],
    ] as const) {
      assert.ok(ankle.y > knee.y + 0.15, 'ankle well below the knee');
    }
    // Torso leans back: her head is behind her hips, away from the giver.
    assert.ok(Math.sign(receiver.head.x - receiver.pelvis.x) === Math.sign(receiver.pelvis.x - giver.pelvis.x));
    // Giver: both knees on the floor line, shins along it; head at her pelvis.
    for (const knee of [giver.lKnee, giver.rKnee]) {
      assert.ok(knee.y >= 0.86, `giver knee on the floor (${knee.y})`);
    }
    for (const ankle of [giver.lAnkle, giver.rAnkle]) {
      assert.ok(Math.abs(ankle.y - giver.lKnee.y) < 0.06, 'shins flat on the floor');
    }
    assert.ok(
      Math.hypot(giver.head.x - receiver.pelvis.x, giver.head.y - receiver.pelvis.y) < 0.12,
      'giver head near her pelvis'
    );
    assert.ok(giver.pelvis.y > receiver.pelvis.y, 'giver kneels below her seat');
  });

  it('seats her on the edge when he goes down on her and nobody kneels in the words', () => {
    // Castcut_01482 replay: "she lies on her back … he lies between her thighs" under the kneel-up
    // map put his mouth on her hip with their legs merged 4/4; seated words + map were right 4/4.
    for (const beat of [
      'oral sex on the bed as the alarm clock blares — oral sex, both adults fully visible',
      'going down on her in the late-morning sheets, partner between her thighs — both adults fully visible',
      'oral sex on the living-room rug with a partner when the pizza arrives — both adults fully visible',
    ]) {
      assert.equal(oralReceiverSeated(beat), true, beat);
      assert.match(buildRapidDuoRecipe({ beat }) ?? '', /The woman sits on the edge of the (?:bed|couch),/, beat);
      const { resolved } = guideFor(beat);
      assert.equal(resolved.intent.intimate, 'oral', beat);
      const [receiver, giver] = resolved.figures;
      assert.ok(receiver && giver);
      // Her hips at seat height, above his kneeling hips; his knees on the floor; head at her pelvis.
      assert.ok(receiver.pelvis.y > 0.45 && receiver.pelvis.y < giver.pelvis.y, beat);
      for (const knee of [giver.lKnee, giver.rKnee]) {
        assert.ok(knee.y >= 0.86, `giver knee on the floor (${knee.y})`);
      }
      assert.ok(
        Math.hypot(giver.head.x - receiver.pelvis.x, giver.head.y - receiver.pelvis.y) < 0.12,
        'giver head at her pelvis'
      );
    }
  });

  it('keeps the kneel-up drawing where the words do not seat her', () => {
    // How far the receiver's torso leans back: seated on her hands vs upright.
    const lean = (beat: string) => {
      const receiver = guideFor(beat).resolved.figures[0]!;
      return Math.abs(receiver.head.x - receiver.pelvis.x);
    };
    assert.ok(
      lean('going down on her at the edge of the bed in morning light, partner kneeling between her thighs') > 0.08
    );
    // Wall oral (she stands, he kneels) keeps the upright receiver.
    assert.ok(
      lean('oral sex: partner kneeling between her thighs, mouth on her vulva, both hands on her thighs') < 0.05
    );
    assert.equal(
      oralReceiverSeated("She's kneeling on a lacquered piano bench as he kneels beside her, tongue on her thigh."),
      false
    );
    assert.equal(oralReceiverSeated('she kneels on the kitchen floor giving her partner oral sex'), false);
    assert.equal(oralReceiverSeated('she goes down on her partner on the couch — oral'), true);
  });

  it('agrees with the man + woman Rapid recipe on every oral / 69 / face-sit beat preset', () => {
    const beats = [
      ...Object.values(DAY_SLOT_INTIMATE_BEAT_PRESETS).flat(),
      ...Object.values(DAY_LATE_SLOT_INTIMATE_BEAT_PRESETS).flat(),
      ...Object.values(DAY_SLOT_RAUNCHY_BEAT_PRESETS).flat(),
      ...Object.values(DAY_LATE_SLOT_RAUNCHY_BEAT_PRESETS).flat(),
    ].filter(beat => {
      const layout = parseIntimateLayout(beat);
      return layout === 'oral' || layout === 'sixty_nine' || layout === 'facesit';
    });
    assert.ok(beats.length >= 8, `${beats.length} oral beats`);
    for (const beat of beats) {
      const recipeSeated = /sits on the edge of [^;]+; the (?:wo)?man kneels on the floor between/.test(
        buildRapidDuoRecipe({ beat }) ?? ''
      );
      const { plan, resolved } = guideFor(beat);
      assert.equal(resolved.intent.intimate, 'oral', beat);
      assert.equal(oralReceiverSeated(plan.sceneText), recipeSeated, beat);
    }
  });
});
