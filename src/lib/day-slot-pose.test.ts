import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayClothedGuideContradictsBeat, planDaySlotPose, plannedDaySlotPoseKey } from './day-slot-pose';

describe('plannedDaySlotPoseKey', () => {
  it('names the layout the slot plan draws, without drawing it', () => {
    const plan = (sceneHints: string, poseLayout?: string) =>
      planDaySlotPose({
        slot: { id: 'morning', sceneHints, ...(poseLayout ? { poseLayout } : {}) },
        dayMood: 'everyday',
        model: 'qwen-rapid-aio-edit',
      });
    assert.equal(plannedDaySlotPoseKey(plan('kneeling in the garden planting herbs'), 'morning'), 'kneel:1');
    // A picked pose wins over the beat.
    assert.equal(plannedDaySlotPoseKey(plan('walking to the cafe', 'cook'), 'morning'), 'cook:1');
  });
});

describe('dayClothedGuideContradictsBeat', () => {
  const contradicts = (sceneHints: string, dayMood = 'suggestive', poseLayout?: string) =>
    dayClothedGuideContradictsBeat({
      slot: { id: 'evening', sceneHints, ...(poseLayout ? { poseLayout } : {}) },
      dayMood,
      intimateMix: 'duo',
      allowCompanions: true,
      model: 'qwen-image-edit-2511',
    });

  it('leaves out a clothed drawing that says something else than the beat', () => {
    // Live 2026-10-06: drawn as a standing hands-on-hips pair / two people sitting.
    assert.equal(
      contradicts(
        'lying face to face on the rumpled bed with her partner, both in sleepwear — his hand on her hip, noses almost touching, morning light'
      ),
      true
    );
    assert.equal(
      contradicts(
        'sitting on the bed edge in lingerie under an open robe with her partner kneeling in front of her, both clothed — he kisses her knee, her hand in his hair'
      ),
      true
    );
    assert.equal(
      contradicts(
        'lying on top of her partner on the bed, both still in evening clothes — he lies on his back across the mattress, she lies stretched out on his chest laughing, his hands on her waist'
      ),
      true
    );
    assert.equal(
      contradicts(
        "sitting sideways on her partner's lap on the couch in a silk robe over a slip — his arm around her waist, her legs draped over his"
      ),
      true
    );
    // Solo: a kneel drawn as a standing look-back.
    assert.equal(
      contradicts('kneeling upright on the rug in a slip dress pouring two glasses of wine, back arched, looking up with a slow smile'),
      true
    );
  });

  it('keeps drawings that match, and every other mood', () => {
    assert.equal(
      contradicts('lying on her side on the hotel bed in lingerie — propped on one elbow, knees drawn up, charged quiet, never nude'),
      false
    );
    // The word reader calls "on her back" lying and "on a pier" standing — not acted on here.
    assert.equal(
      contradicts(
        'slow-dancing close with her partner on a dim rooftop in an evening dress — her cheek on his chest, his hand low on her back'
      ),
      false
    );
    assert.equal(
      contradicts('RELAXING on a pier bench watching the sunset — evening dress, shoes kicked off, golden water below, quiet pause', 'vacation'),
      false
    );
    assert.equal(
      contradicts('PEDALING a rental bike along the promenade — sundress, basket on the handlebars, morning sea breeze', 'vacation'),
      false
    );
    // Everyday draws lying and kneeling as written.
    assert.equal(contradicts('lying face to face on the rumpled bed with her partner', 'everyday'), false);
    // A pose the player picked is always drawn.
    assert.equal(
      contradicts('lying face to face on the rumpled bed with her partner, both in sleepwear', 'suggestive', 'hug'),
      false
    );
  });
});
