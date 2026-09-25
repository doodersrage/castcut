import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeScenePoseSpec,
  parseSocialLayout,
  SCENE_POSE_LAYOUT_IDS,
  synthesizeSceneStickFigures,
} from './day-pose-guide';
import { diversifyDaySlotScenes, normalizeDaySlots, type DaySlot } from './day-planner';
import { daySlotPoseOverride, mergePickedPose, planDaySlotPose } from './day-slot-pose';
import {
  poseLayoutFromKey,
  cuePoseLayouts,
  poseMatchByLayoutSummary,
  weakPoseLayouts,
  type PlayMetrics,
} from './play-metrics';
import { POSE_PICKER_GROUPS, poseLayoutLabel } from './pose-layout-labels';
import { normalizeRoleplayLibrarySnapshot } from './roleplay-library';
import { roleplayScenePoseKey } from './roleplay';

const slot = (patch: Partial<DaySlot> = {}): DaySlot => ({
  id: 'morning',
  label: 'Morning',
  sceneHints: 'stirring a pot of risotto at the stove',
  location: 'small kitchen',
  ...patch,
});

describe('writer-named layouts', () => {
  it('keeps a known layout on the pose spec and drops unknown ones', () => {
    assert.deepEqual(normalizeScenePoseSpec({ layout: 'cook' }), { layout: 'cook' });
    assert.equal(normalizeScenePoseSpec({ layout: 'moonwalk' }), undefined);
  });

  it('draws the named layout even when the blurb says something else', () => {
    const drawn = synthesizeSceneStickFigures('she waits in the hallway', 0, {
      forcePeople: 1,
      pose: { layout: 'cook' },
    });
    assert.equal(drawn.intent.social, 'cook');
    assert.equal(drawn.figures.length, 1);
  });

  it('keys Story variety by the named layout', () => {
    assert.equal(
      roleplayScenePoseKey({ title: 'Beat', blurb: 'in the kitchen', pose: { layout: 'cook' } }),
      'cook'
    );
    assert.equal(roleplayScenePoseKey({ title: 'Beat', blurb: 'taking a selfie on the bridge' }), 'selfie');
  });

  it('offers the scene writer everyday, two-person and sport layouts', () => {
    for (const id of ['cook', 'hold_hands', 'sport_skate']) {
      assert.ok((SCENE_POSE_LAYOUT_IDS as readonly string[]).includes(id), id);
    }
  });
});

describe('picked pose', () => {
  it('maps a picker id to a layout or a posture', () => {
    assert.deepEqual(daySlotPoseOverride('selfie'), { layout: 'selfie' });
    assert.deepEqual(daySlotPoseOverride('sit'), { body: 'sit' });
    assert.equal(daySlotPoseOverride('nope'), null);
    assert.equal(daySlotPoseOverride(undefined), null);
  });

  it('offers only ids the guide can draw, each with a name', () => {
    const drawable = new Set<string>([
      ...SCENE_POSE_LAYOUT_IDS,
      'stand',
      'walk',
      'run',
      'sit',
      'crouch',
      'kneel',
      'reach',
      'lean',
      'lie',
      'jump',
    ]);
    for (const group of POSE_PICKER_GROUPS) {
      for (const id of group.ids) {
        assert.ok(drawable.has(id), id);
        assert.ok(daySlotPoseOverride(id), id);
        assert.notEqual(poseLayoutLabel(id), 'Auto');
      }
    }
  });

  it('a picked layout replaces the written one but keeps headcount', () => {
    assert.deepEqual(mergePickedPose('wave', { layout: 'cook', people: 2 }), {
      layout: 'wave',
      people: 2,
    });
    assert.deepEqual(mergePickedPose('sit', { layout: 'read' }), { layout: 'read', body: 'sit' });
    assert.deepEqual(mergePickedPose(undefined, { layout: 'read' }), { layout: 'read' });
  });

  it('plans the Day slot guide with the pick, the variant, and weak-layout routing', () => {
    const weak = new Set(['cook']);
    const auto = planDaySlotPose({ slot: slot(), dayMood: 'everyday', weakLayouts: weak });
    assert.equal(auto.options.avoidLayouts, weak);
    assert.equal(auto.options.variant, 0);

    const picked = planDaySlotPose({
      slot: slot({ poseLayout: 'cook', poseVariant: 2 }),
      dayMood: 'everyday',
      retryVariant: 1,
      weakLayouts: weak,
    });
    assert.equal(picked.options.avoidLayouts, undefined, 'a pick is drawn as picked');
    assert.equal(picked.options.pose?.layout, 'cook');
    assert.equal(picked.options.variant, 3);

    const drawn = synthesizeSceneStickFigures(picked.sceneText, 0, {
      ...planDaySlotPose({ slot: slot({ poseLayout: 'wave' }), dayMood: 'everyday' }).options,
    });
    assert.equal(drawn.intent.social, 'wave');
  });

  it('plain posture drops the gesture but keeps the stance', () => {
    const text = 'stirring a pot of risotto at the stove';
    assert.equal(synthesizeSceneStickFigures(text, 0, { forcePeople: 1 }).intent.social, 'cook');
    const plain = synthesizeSceneStickFigures(text, 0, { forcePeople: 1, plainPosture: true });
    assert.equal(plain.intent.social, null);
    assert.equal(plain.figures.length, 1);
  });

  it('keeps the pick through Day slot and Story library normalization', () => {
    const [kept] = normalizeDaySlots([slot({ poseLayout: 'selfie', poseVariant: 4 })]);
    assert.equal(kept?.poseLayout, 'selfie');
    assert.equal(kept?.poseVariant, 4);

    const snapshot = normalizeRoleplayLibrarySnapshot({
      story: [
        {
          id: 'b1',
          at: 1,
          title: 'Beat',
          blurb: 'at the stove',
          pose: { layout: 'cook' },
          poseLayout: 'wave',
          poseVariant: 3,
        },
      ],
    });
    const beat = snapshot?.story?.[0];
    assert.equal(beat?.pose?.layout, 'cook');
    assert.equal(beat?.poseLayout, 'wave');
    assert.equal(beat?.poseVariant, 3);
  });
});

describe('pose match by layout', () => {
  const metrics = (byLayout: Record<string, [number, number]>): PlayMetrics => ({
    version: 1,
    poseMatchByLayout: Object.fromEntries(
      Object.entries(byLayout).map(([layout, [mean, count]]) => [
        layout,
        { sum: mean * count, count, misses: 0 },
      ])
    ),
  });

  it('reads the layout from a pose key', () => {
    assert.equal(poseLayoutFromKey('cook:1'), 'cook');
    assert.equal(poseLayoutFromKey('sit'), 'sit');
    assert.equal(poseLayoutFromKey(''), null);
    assert.equal(poseLayoutFromKey(undefined), null);
  });

  it('lists layouts weakest first', () => {
    const summary = poseMatchByLayoutSummary(metrics({ cook: [0.7, 3], wave: [0.3, 2] }));
    assert.deepEqual(
      summary.map(entry => entry.layout),
      ['wave', 'cook']
    );
  });

  it('spells a poorly followed layout out first, and swaps it only when words fail too', () => {
    const stats = (mean: number, count: number) => ({ sum: mean * count, count, misses: 0 });
    const plain = metrics({ cook: [0.3, 8], wave: [0.3, 7], selfie: [0.5, 20], piggyback: [0.44, 12] });
    // No cued attempts yet: words first, nothing swapped.
    assert.deepEqual([...cuePoseLayouts(plain)].sort(), ['cook', 'piggyback']);
    assert.equal(weakPoseLayouts(plain).size, 0);
    // Words helped cook; piggyback still misses with them (4+ cued checks under 0.45).
    const withWords: PlayMetrics = {
      ...plain,
      poseMatchByLayoutCued: { cook: stats(0.7, 5), piggyback: stats(0.3, 4) },
    };
    assert.deepEqual([...cuePoseLayouts(withWords)].sort(), ['cook']);
    assert.deepEqual([...weakPoseLayouts(withWords)], ['piggyback']);
    // Too few cued checks to judge: keep trying the words.
    const early: PlayMetrics = { ...plain, poseMatchByLayoutCued: { piggyback: stats(0.2, 3) } };
    assert.ok(cuePoseLayouts(early).has('piggyback'));
    assert.equal(weakPoseLayouts(early).size, 0);
    // The summary carries the cued record next to the plain one.
    const cook = poseMatchByLayoutSummary(withWords).find(entry => entry.layout === 'cook');
    assert.equal(cook?.cued?.count, 5);
  });
});

describe('Suggest day layout variety', () => {
  it('does not put the same drawn gesture on two slots when the pools allow', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let run = 0; run < 40; run += 1) {
      const { slots } = diversifyDaySlotScenes(
        normalizeDaySlots([
          { id: 'morning', label: 'Morning' },
          { id: 'afternoon', label: 'Afternoon' },
          { id: 'evening', label: 'Evening' },
          { id: 'night', label: 'Night' },
        ]),
        { forceBeats: true, forceLocations: true, dayMood: 'everyday', allowCompanions: true, random }
      );
      const layouts = slots
        .map(entry => parseSocialLayout(entry.sceneHints ?? ''))
        .filter((layout): layout is NonNullable<typeof layout> => Boolean(layout));
      assert.equal(new Set(layouts).size, layouts.length, layouts.join(', '));
    }
  });
});
