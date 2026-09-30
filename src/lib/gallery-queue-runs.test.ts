import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  filmRunMisses,
  firstUnreviewedInRun,
  groupGalleryFilmRuns,
  groupGalleryQueueRuns,
} from './gallery-queue-runs';

function entry(
  id: string,
  overrides: Partial<ComfyGalleryEntry> = {}
): ComfyGalleryEntry {
  return {
    id,
    promptId: id,
    prompt: 'test prompt',
    tool: 'qwen-image',
    model: 'qwen-image-2512',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: 1,
    images: [],
    ...overrides,
  };
}

describe('groupGalleryQueueRuns', () => {
  it('clusters same-tool entries queued within the window into a run', () => {
    const entries = [
      entry('a', { queuedAt: 1_000 }),
      entry('b', { queuedAt: 5_000 }),
      entry('c', { queuedAt: 10_000 }),
    ];

    const runs = groupGalleryQueueRuns(entries, 45_000);

    assert.equal(runs.length, 1);
    assert.deepEqual(
      runs[0]?.entries.map(e => e.id),
      ['a', 'b', 'c']
    );
  });

  it('does not form a run below the minimum batch size', () => {
    const entries = [entry('a', { queuedAt: 1_000 }), entry('b', { queuedAt: 5_000 })];
    assert.deepEqual(groupGalleryQueueRuns(entries, 45_000), []);
  });

  it('splits entries queued far apart into separate runs', () => {
    const entries = [
      entry('a', { queuedAt: 0 }),
      entry('b', { queuedAt: 1_000 }),
      entry('c', { queuedAt: 2_000 }),
      entry('d', { queuedAt: 100_000 }),
      entry('e', { queuedAt: 101_000 }),
      entry('f', { queuedAt: 102_000 }),
    ];

    const runs = groupGalleryQueueRuns(entries, 45_000);

    assert.equal(runs.length, 2);
    assert.deepEqual(
      runs.map(run => run.entries.map(e => e.id)),
      [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]
    );
  });

  it('excludes pending entries from run detection', () => {
    const entries = [
      entry('a', { queuedAt: 0, status: 'pending' }),
      entry('b', { queuedAt: 1_000, status: 'pending' }),
      entry('c', { queuedAt: 2_000, status: 'pending' }),
    ];
    assert.deepEqual(groupGalleryQueueRuns(entries), []);
  });

  it('gives two different same-tool batches distinct run ids, even with a long tool name and close timestamps', () => {
    // Regression test: the previous id scheme (`run-${tool}-${queuedAt}`
    // sliced to 32 chars) truncated away most or all of the queuedAt digits
    // once the tool name was long enough -- e.g. "wan-video-rapid-aio" (19
    // chars) left only the leading ~8 digits of the 13-digit epoch-ms
    // timestamp, so two batches of the same tool queued within the same
    // ~100-second bucket produced an IDENTICAL id. That id is used as both
    // the React row key and the collapse/winner lookup key, so a collision
    // made two unrelated batches clobber each other's UI state.
    const longTool = 'wan-video-rapid-aio';
    const batchOne = [
      entry('one-a', { tool: longTool, queuedAt: 1_787_149_200_000 }),
      entry('one-b', { tool: longTool, queuedAt: 1_787_149_201_000 }),
      entry('one-c', { tool: longTool, queuedAt: 1_787_149_202_000 }),
    ];
    const batchTwo = [
      // Same leading digits as batchOne's queuedAt values, just under the
      // old scheme's ~100-second truncation bucket, but a distinct batch.
      entry('two-a', { tool: longTool, queuedAt: 1_787_149_260_000 }),
      entry('two-b', { tool: longTool, queuedAt: 1_787_149_261_000 }),
      entry('two-c', { tool: longTool, queuedAt: 1_787_149_262_000 }),
    ];

    // windowMs small enough that the two batches don't merge into one run.
    const runs = groupGalleryQueueRuns([...batchOne, ...batchTwo], 5_000);

    assert.equal(runs.length, 2);
    assert.notEqual(runs[0]?.id, runs[1]?.id);
  });

  it('reports seed/cfg/step variants across the run', () => {
    const entries = [
      entry('a', { queuedAt: 0, queueParams: { seed: 1, cfg: 4, steps: 20 } }),
      entry('b', { queuedAt: 1_000, queueParams: { seed: 2, cfg: 4, steps: 20 } }),
      entry('c', { queuedAt: 2_000, queueParams: { seed: 3, cfg: 5, steps: 25 } }),
    ];

    const runs = groupGalleryQueueRuns(entries, 45_000);

    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0]?.variants.seeds.sort(), ['1', '2', '3']);
    assert.deepEqual(runs[0]?.variants.cfgValues.sort(), ['4', '5']);
    assert.deepEqual(runs[0]?.variants.stepValues.sort(), ['20', '25']);
  });
});

describe('groupGalleryFilmRuns', () => {
  const minute = 60_000;
  it('keeps a Cast lead Day run together across minute gaps and splits at a long break', () => {
    const at = (m: number) => m * minute;
    const entries = [
      entry('s1', { characterId: 'cast-a', queuedAt: at(0) }),
      entry('s2', { characterId: 'cast-a', queuedAt: at(1) }),
      entry('s3', { characterId: 'cast-a', queuedAt: at(2) }),
      entry('c1', { characterId: 'cast-a', queuedAt: at(8), tool: 'video', derivedKind: 'i2v' }),
      entry('s4', { characterId: 'cast-a', queuedAt: at(60) }),
      entry('s5', { characterId: 'cast-a', queuedAt: at(61) }),
      entry('s6', { characterId: 'cast-a', queuedAt: at(62) }),
      entry('x', { queuedAt: at(1) }),
    ];
    const runs = groupGalleryFilmRuns(entries, { nameFor: () => 'Loose Lana' });
    assert.deepEqual(
      runs.map(run => run.entries.map(e => e.id)),
      [
        ['s1', 's2', 's3', 'c1'],
        ['s4', 's5', 's6'],
      ]
    );
    assert.equal(runs[0]?.kind, 'run');
    assert.match(runs[0]!.label, /^Loose Lana · .+ · 3 stills · 1 clip$/);
  });

  it('flags low-rated and missed stills as misses, and finds the first unrated still', () => {
    const run = [
      entry('a', { reviewRating: 5 }),
      entry('b', { reviewRating: 2 }),
      entry('c', { playChecks: { poseMiss: true, at: 1 } }),
      entry('d'),
    ];
    assert.deepEqual(filmRunMisses(run).map(e => e.id), ['b', 'c']);
    assert.equal(firstUnreviewedInRun(run)?.id, 'c');
  });
});
