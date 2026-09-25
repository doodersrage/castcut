import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inferAthleticSport } from './athletic-sport-profiles';
import {
  parseSocialLayout,
  synthesizeSceneStickFigures,
  type StickSkeleton,
} from './day-pose-guide';
import { buildDaySportBeatPresets } from './day-sport';

const SAMPLES: Record<string, string> = {
  sit_floor: 'sitting cross-legged on the rug with a mug',
  lounge_elbows: 'propped back on her elbows on the beach towel',
  lie_front: 'lying on her stomach on the bed, feet kicked up behind, scrolling a phone',
  lie_side: 'lying on her side on the picnic blanket, head propped on one hand',
  perch_edge: 'perched on the kitchen counter, legs dangling',
  hands_behind_head: 'standing at the window, hands behind her head',
  arms_up: 'throws both arms up in the air at the finish line',
  selfie: 'taking a selfie on the bridge with the skyline behind',
  photograph: 'snapping a photo of the harbor with a film camera',
  cook: 'stirring a pot of risotto at the stove',
  laptop: 'working on her laptop at the café table',
  eat: 'sitting at the diner counter taking a bite of a burger',
  hold_hands: 'walking hand in hand with a friend along the pier',
  piggyback: 'riding piggyback on a friend down the beach',
  high_five: 'high-fiving a friend after the climb',
  toast: 'clinking glasses with a friend at the rooftop bar',
  head_shoulder: "sitting on the bench, head resting on a friend's shoulder",
  selfie_duo: 'selfie with a friend on the ferry deck',
  sport_squat: 'barbell back squat in the squat rack',
  sport_deadlift: 'pulling a deadlift from the floor',
  sport_pushup: 'push-ups on the gym mat',
  sport_plank: 'holding a forearm plank on the mat',
  sport_pullup: 'strict pull-ups on the bar',
  sport_skate: 'cruising on her skateboard through the skate park',
};

const DUO = new Set(['hold_hands', 'piggyback', 'high_five', 'toast', 'head_shoulder', 'selfie_duo']);
const LYING = new Set(['lounge_elbows', 'lie_front', 'lie_side', 'sport_pushup', 'sport_plank']);

const solo = (text: string) =>
  synthesizeSceneStickFigures(text, 0, { forcePeople: 1, allowIntimate: false });
const pair = (text: string) =>
  synthesizeSceneStickFigures(text, 0, { forcePeople: 2, allowIntimate: false });

function inFrame(figure: StickSkeleton): boolean {
  return Object.values(figure)
    .filter((p): p is { x: number; y: number } => typeof p === 'object' && p !== null)
    .every(p => p.x >= 0.04 && p.x <= 0.96 && p.y >= 0.06 && p.y <= 0.94);
}

/** Horizontal body: head and pelvis at about the same height, far apart sideways. */
function isHorizontal(f: StickSkeleton): boolean {
  return Math.abs(f.head.y - f.pelvis.y) < 0.2 && Math.abs(f.head.x - f.pelvis.x) > 0.25;
}

describe('new pose layouts', () => {
  it('reads each layout from beat text', () => {
    for (const [layout, text] of Object.entries(SAMPLES)) {
      assert.equal(parseSocialLayout(text), layout, text);
    }
  });

  it('draws one figure solo; two-person layouts draw a pair only when two are allowed', () => {
    for (const [layout, text] of Object.entries(SAMPLES)) {
      assert.equal(solo(text).figures.length, 1, `${layout} solo`);
      if (DUO.has(layout)) {
        assert.equal(pair(text).figures.length, 2, `${layout} duo`);
      }
    }
  });

  it('keeps every joint on the canvas', () => {
    for (const text of Object.values(SAMPLES)) {
      for (const figure of [...solo(text).figures, ...pair(text).figures]) {
        assert.ok(inFrame(figure), text);
      }
    }
  });

  it('draws lying layouts horizontal and upright ones upright', () => {
    for (const [layout, text] of Object.entries(SAMPLES)) {
      const [figure] = solo(text).figures;
      if (LYING.has(layout)) {
        assert.ok(isHorizontal(figure!), `${layout} should lie`);
      } else if (['selfie', 'photograph', 'cook', 'arms_up', 'sport_pullup'].includes(layout)) {
        assert.ok(figure!.head.y < figure!.pelvis.y - 0.25, `${layout} should stand`);
      }
    }
  });

  it('shapes the signature joints of each pose', () => {
    const f = (layout: string) => solo(SAMPLES[layout]!).figures[0]!;
    const high = (p: { y: number }, than: { y: number }) => p.y < than.y;
    // Arms up: both wrists above the head.
    const up = f('arms_up');
    assert.ok(high(up.lWrist, up.head) && high(up.rWrist, up.head));
    // Pull-up: wrists at the bar above the head, feet off the floor.
    const pull = f('sport_pullup');
    assert.ok(high(pull.lWrist, pull.head) && pull.lAnkle.y < 0.88 && pull.rAnkle.y < 0.88);
    // Camera to the eye: both wrists up at the face.
    const photo = f('photograph');
    assert.ok(Math.abs(photo.lWrist.y - photo.head.y) < 0.06);
    // Squat: hips down near knee height.
    const squat = f('sport_squat');
    assert.ok(Math.abs(squat.pelvis.y - squat.lKnee.y) < 0.06);
    // Cross-legged on the floor: knees wide of the hips, hips low.
    const floor = f('sit_floor');
    assert.ok(floor.pelvis.y > 0.7 && Math.abs(floor.lKnee.x - floor.rKnee.x) > 0.35);
  });

  it('meets hands in the middle for hold hands, high five and toast', () => {
    for (const layout of ['hold_hands', 'high_five', 'toast']) {
      const [lead, partner] = pair(SAMPLES[layout]!).figures;
      const leadHand = lead!.rWrist.x > lead!.lWrist.x ? lead!.rWrist : lead!.lWrist;
      const partnerHand = partner!.lWrist.x < partner!.rWrist.x ? partner!.lWrist : partner!.rWrist;
      assert.ok(Math.hypot(leadHand.x - partnerHand.x, leadHand.y - partnerHand.y) < 0.08, layout);
    }
  });
});

describe('pose guide fixes', () => {
  it('draws solo gesture layouts as one figure (they used to fall through to a fight pair)', () => {
    for (const text of [
      'stands with hands on hips looking at the view',
      'bends down to pick up a shell',
      'one foot up on the bench tying a lace',
      'leans against the wall waiting',
      'tucks her hair behind her ear',
      'shrugs with palms up',
      'climbs the stairs to the flat',
    ]) {
      assert.equal(solo(text).figures.length, 1, text);
      assert.equal(
        synthesizeSceneStickFigures(text, 0, { clothedUprightOnly: true, forcePeople: 1 }).figures
          .length,
        1,
        `${text} (clothed)`
      );
    }
  });

  it('keeps a stated posture for a hand gesture instead of standing the figure up', () => {
    const lying = solo('lying across the bed scrolling a phone, ankles crossed').figures[0]!;
    assert.ok(Math.abs(lying.head.y - lying.pelvis.y) < 0.2, 'phone while lying is not upright');
    const seated = solo('sitting on the edge of the bed checking a phone').figures[0]!;
    assert.ok(seated.pelvis.y > 0.65, 'phone while seated sits');
  });

  it('does not mistake a book on the stomach or scenery in a selfie for the new layouts', () => {
    assert.notEqual(
      parseSocialLayout('lying flat on the chaise on her back, paperback on her stomach'),
      'lie_front'
    );
    assert.equal(parseSocialLayout('taking a selfie with the boats behind'), 'selfie');
    assert.equal(parseSocialLayout('mirror selfie at the hall mirror'), 'phone');
    // Food, not a raised glass.
    assert.notEqual(parseSocialLayout('avocado toast at the café'), 'toast');
  });
});

describe('gym and skateboarding sports', () => {
  it('infers the sport without stealing a boxing gym', () => {
    assert.equal(inferAthleticSport('barbell back squat in the squat rack'), 'gym');
    assert.equal(inferAthleticSport('kickflip in the skate park'), 'skateboarding');
    assert.equal(
      inferAthleticSport('working the heavy bag in a gym corner with a chalked floor'),
      'boxing'
    );
  });

  it("offers gym and skate beats whose guides draw the sport's layout", () => {
    const beats = [
      ...buildDaySportBeatPresets('morning'),
      ...buildDaySportBeatPresets('afternoon'),
      ...buildDaySportBeatPresets('evening'),
      ...buildDaySportBeatPresets('night'),
    ];
    const gym = beats.filter(beat => beat.includes('gym strength training'));
    const skate = beats.filter(beat => beat.includes('skateboarding athletic'));
    assert.ok(gym.length > 0 && skate.length > 0);
    for (const beat of gym) {
      assert.match(String(parseSocialLayout(beat)), /^sport_(squat|deadlift|pushup|plank|pullup)$/, beat);
    }
    for (const beat of skate) {
      assert.equal(parseSocialLayout(beat), 'sport_skate', beat);
    }
  });
});
