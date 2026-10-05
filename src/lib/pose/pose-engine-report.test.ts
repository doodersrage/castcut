import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  pickPoseEngine,
  POSE_ENGINE_REPORT,
  POSE_REPORT_ENGINES,
  poseEngineSwapReason,
  poseReportRow,
  poseWeakOnModel,
  reportWeakPoseLayouts,
  type PoseEngineReport,
} from './pose-engine-report';
import { applyPosePackToSlots, BUILT_IN_POSE_PACKS } from '../day-pose-packs';
import { daySlotPoseLayout } from '../day-slot-pose';

const REPORT: PoseEngineReport = {
  date: '2026-10-03',
  poses: {
    lie_side: {
      'rapid-aio': { rate: 1, n: 3, face: 0.5 },
      'qwen-edit-2511': { rate: 0, n: 2, face: 0.4 },
      'qwen-image-2.1': { rate: 1, n: 3, face: 0.1 },
    },
    walk: {
      'rapid-aio': { rate: 1, n: 3 },
      'qwen-edit-2511': { rate: 1, n: 2 },
      'qwen-image-2.1': { rate: 1, n: 3 },
    },
    sport_pushup: {
      'rapid-aio': { rate: 0, n: 3 },
      'qwen-edit-2511': { rate: 0.5, n: 2 },
      'qwen-image-2.1': { rate: 0, n: 3 },
    },
    point: {
      'rapid-aio': { rate: 1, n: 1 },
      'qwen-edit-2511': { rate: 0.5, n: 2 },
    },
    jump: {
      'rapid-aio': { rate: 0.5, n: 2 },
      'qwen-edit-2511': { rate: 1, n: 2 },
    },
    'vacation/lie': {
      'rapid-aio': { rate: 1, n: 2 },
      'qwen-edit-2511': { rate: 1, n: 2 },
      'qwen-image-2.1': { rate: 0.5, n: 2 },
    },
    lie: {
      'rapid-aio': { rate: 1, n: 2 },
      'qwen-image-2.1': { rate: 1, n: 2 },
    },
  },
};

const ALL = () => true;
const base = {
  enabled: true,
  mood: 'everyday',
  headcount: 1,
  adult: false,
  installed: ALL,
  report: REPORT,
};

describe('pose report card: picking the engine per pose', () => {
  it('moves a pose that is weak here and solid elsewhere — never onto Qwen-Image 2.1', () => {
    // 2.1 has the closer face on lie_side, but a hand-off never lands there (distorted stills,
    // user report 2026-10-05): Rapid holds it too.
    const swap = pickPoseEngine({
      ...base,
      model: 'qwen-image-edit-2511-lightning-8',
      layout: 'lie_side',
    });
    assert.equal(swap?.engine, 'rapid-aio');
    assert.equal(swap?.model, 'qwen-rapid-aio-edit');
    assert.equal(swap?.from, 'qwen-edit-2511');
    assert.equal(swap?.reason, 'Rendered on Rapid AIO — it holds this pose better');
  });

  it('reads a pose key (`layout:people`) like its layout', () => {
    const swap = pickPoseEngine({ ...base, model: 'qwen-image-edit-2511', layout: 'lie_side:1' });
    assert.equal(swap?.engine, 'rapid-aio');
  });

  it('keeps the engine when the pose holds there, or nowhere holds it', () => {
    assert.equal(pickPoseEngine({ ...base, model: 'qwen-rapid-aio-edit', layout: 'walk' }), null);
    assert.equal(pickPoseEngine({ ...base, model: 'qwen-rapid-aio-edit', layout: 'lie_side' }), null);
    // Weak everywhere: 1/2 on 2511 is not "solid".
    assert.equal(
      pickPoseEngine({ ...base, model: 'qwen-rapid-aio-edit', layout: 'sport_pushup' }),
      null
    );
    // Unknown pose, photo pose (no layout).
    assert.equal(pickPoseEngine({ ...base, model: 'qwen-rapid-aio-edit', layout: 'hug' }), null);
    assert.equal(pickPoseEngine({ ...base, model: 'qwen-rapid-aio-edit', layout: null }), null);
  });

  it('needs two judged stills on both sides', () => {
    // Rapid is 1/1 on point: too few to trust.
    assert.equal(
      pickPoseEngine({ ...base, model: 'qwen-image-edit-2511-lightning-8', layout: 'point' }),
      null
    );
  });

  it('only moves to an installed engine, trying the family siblings', () => {
    assert.equal(
      pickPoseEngine({
        ...base,
        model: 'qwen-image-edit-2511-lightning-8',
        layout: 'lie_side',
        installed: id => id === 'qwen-rapid-aio-edit',
      })?.model,
      'qwen-rapid-aio-edit'
    );
    assert.equal(
      pickPoseEngine({
        ...base,
        model: 'qwen-image-edit-2511-lightning-8',
        layout: 'lie_side',
        installed: id => id === 'qwen-image-2.1-edit',
      }),
      null,
      'only Qwen-Image 2.1 installed: keep the engine'
    );
    assert.equal(
      pickPoseEngine({
        ...base,
        model: 'qwen-image-edit-2511-lightning-8',
        layout: 'lie_side',
        installed: () => false,
      }),
      null
    );
  });

  it('respects the routing rules: off, two people, adult stills, other engines', () => {
    const input = { ...base, model: 'qwen-image-edit-2511-lightning-8', layout: 'lie_side' };
    assert.equal(pickPoseEngine({ ...input, enabled: false }), null);
    assert.equal(pickPoseEngine({ ...input, headcount: 2 }), null);
    assert.equal(pickPoseEngine({ ...input, adult: true }), null);
    assert.equal(pickPoseEngine({ ...input, mood: 'intimate' }), null);
    // Engines the card doesn't measure keep their pick.
    assert.equal(pickPoseEngine({ ...input, model: 'flux-2-klein-9b' }), null);
  });

  it('reads the mood row first for Vacation / Suggestive beats', () => {
    assert.equal(poseReportRow('lie', { mood: 'vacation', report: REPORT }), REPORT.poses['vacation/lie']);
    assert.equal(poseReportRow('lie', { mood: 'everyday', report: REPORT }), REPORT.poses.lie);
    // A mood without its own row falls back to the layout's.
    assert.equal(poseReportRow('jump', { mood: 'vacation', report: REPORT }), REPORT.poses.jump);
    const vacation = pickPoseEngine({
      ...base,
      model: 'qwen-image-2.1-edit-pruna-8',
      layout: 'lie',
      mood: 'vacation',
    });
    assert.equal(vacation?.engine, 'rapid-aio');
    assert.equal(
      pickPoseEngine({ ...base, model: 'qwen-image-2.1-edit-pruna-8', layout: 'lie' }),
      null
    );
  });

  it('never moves a Suggestive still onto Qwen-Image 2.1', () => {
    const report: PoseEngineReport = {
      date: '2026-10-03',
      poses: {
        'suggestive/lie_side': {
          'rapid-aio': { rate: 0.5, n: 2 },
          'qwen-edit-2511': { rate: 0, n: 2 },
          'qwen-image-2.1': { rate: 1, n: 2 },
        },
      },
    };
    const input = { ...base, report, model: 'qwen-image-edit-2511-lightning-8', layout: 'lie_side' };
    assert.equal(pickPoseEngine({ ...input, mood: 'suggestive' }), null);
  });

  it('names the engine on the card', () => {
    assert.equal(
      poseEngineSwapReason('qwen-edit-2511'),
      'Rendered on Edit 2511 — it holds this pose better'
    );
  });
});

describe('pose report card: weak layouts', () => {
  it('lists the layouts an engine is weak on (not the mood rows)', () => {
    assert.deepEqual([...reportWeakPoseLayouts('qwen-image-edit-2511', REPORT)].sort(), [
      'lie_side',
      'point',
      'sport_pushup',
    ]);
    assert.deepEqual([...reportWeakPoseLayouts('qwen-rapid-aio-edit-nsfw', REPORT)].sort(), [
      'jump',
      'sport_pushup',
    ]);
    assert.equal(reportWeakPoseLayouts('sdxl', REPORT).size, 0);
    assert.equal(poseWeakOnModel('lie_side', 'qwen-image-edit-2511', { report: REPORT }), true);
    assert.equal(poseWeakOnModel('walk', 'qwen-image-edit-2511', { report: REPORT }), false);
  });

  it('pose packs skip the weak layouts (unless that leaves none)', () => {
    const portrait = BUILT_IN_POSE_PACKS.find(pack => pack.id === 'portrait')!;
    const slots = Array.from({ length: 4 }, (_, index) => ({
      id: (['morning', 'afternoon', 'evening', 'night'] as const)[index]!,
      label: 'x',
    }));
    const avoid = new Set(['hands_hips', 'cross_arms']);
    const result = applyPosePackToSlots(slots, portrait, { avoidLayouts: avoid });
    assert.ok(result.slots.every(slot => !avoid.has(slot.poseLayout ?? '')));
  });
});

describe('the shipped pose report card', () => {
  it('has a date and well-formed rows for the three Day still engines', () => {
    assert.match(POSE_ENGINE_REPORT.date, /^\d{4}-\d{2}-\d{2}$/);
    const keys = Object.keys(POSE_ENGINE_REPORT.poses);
    assert.ok(keys.length >= 70, `rows: ${keys.length}`);
    for (const [key, row] of Object.entries(POSE_ENGINE_REPORT.poses)) {
      for (const engine of POSE_REPORT_ENGINES) {
        const score = row[engine];
        if (!score) continue;
        assert.ok(score.rate >= 0 && score.rate <= 1, `${key} ${engine} rate`);
        assert.ok(Number.isInteger(score.n) && score.n > 0, `${key} ${engine} n`);
      }
    }
  });

  it('a Day slot is keyed by the layout its guide draws', () => {
    const plan = daySlotPoseLayout({
      slot: { id: 'morning', sceneHints: 'walks down the street mid-stride', poseLayout: 'walk' },
      dayMood: 'everyday',
      model: 'qwen-rapid-aio-edit',
    });
    assert.deepEqual(plan, { layout: 'walk', headcount: 1 });
    const sport = daySlotPoseLayout({
      slot: { id: 'night', sceneHints: 'holds a forearm plank on a mat', poseLayout: 'sport_plank' },
      dayMood: 'sport',
      model: 'qwen-image-edit-2511-lightning-8',
    });
    assert.equal(sport.layout, 'sport_plank');
    assert.equal(
      daySlotPoseLayout({ slot: { id: 'morning' }, dayMood: 'everyday', model: null }).layout,
      null
    );
  });
});
