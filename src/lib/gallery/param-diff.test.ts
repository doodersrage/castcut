import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGalleryParamDiff,
  formatExperimentParamDiffChips,
} from './param-diff';
import type { ComfyGalleryEntry } from './comfyui-gallery';

function entry(
  partial: Partial<ComfyGalleryEntry> & Pick<ComfyGalleryEntry, 'id'>
): ComfyGalleryEntry {
  return {
    prompt: 'test',
    status: 'completed',
    queuedAt: 1,
    images: [],
    ...partial,
  } as ComfyGalleryEntry;
}

describe('buildGalleryParamDiff', () => {
  it('marks axes that differ across entries', () => {
    const rows = buildGalleryParamDiff([
      entry({
        id: 'a',
        model: 'm1',
        queueParams: { seed: '1', cfg: '4', steps: '20' },
      }),
      entry({
        id: 'b',
        model: 'm1',
        queueParams: { seed: '2', cfg: '4', steps: '28' },
      }),
    ]);
    const byKey = Object.fromEntries(rows.map(row => [row.key, row]));
    assert.equal(byKey.seed?.differs, true);
    assert.equal(byKey.steps?.differs, true);
    assert.equal(byKey.cfg?.differs, false);
    assert.equal(byKey.model?.differs, false);
  });
});

describe('formatExperimentParamDiffChips', () => {
  it('returns only differing non-tool axes', () => {
    const chips = formatExperimentParamDiffChips([
      entry({
        id: 'a',
        tool: 'compose',
        queueParams: { seed: '1', cfg: '3.5' },
      }),
      entry({
        id: 'b',
        tool: 'param-experiment',
        queueParams: { seed: '9', cfg: '3.5' },
      }),
    ]);
    assert.ok(chips.some(chip => chip.startsWith('Seed:')));
    assert.ok(!chips.some(chip => chip.startsWith('Tool:')));
    assert.ok(!chips.some(chip => chip.startsWith('CFG:')));
  });
});
