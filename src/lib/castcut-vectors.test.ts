import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compositeThroughMask, repairSubjectMask, type MaskRgb } from './isolate-mask';
import type { NormalizedBody } from './pose-library';
import { parseOpenPoseJson, scorePoseMatch } from './pose-score';

/**
 * The Castcut node pack's shared test vectors (comfyui-nodes/castcut/tests/vectors), written by
 * scripts/castcut-test-vectors.mts from this TypeScript code. This side checks the TS code still
 * gives those answers; the pack's Python tests check the port gives them too. A change to the
 * pose check or the mask repair fails here first — rerun the script, then the Python tests.
 */

const VECTORS = join(process.cwd(), 'comfyui-nodes', 'castcut', 'tests', 'vectors');

function load<T>(name: string): T[] {
  return (JSON.parse(readFileSync(join(VECTORS, name), 'utf8')) as { cases: T[] }).cases;
}

type PoseCase = {
  id: string;
  guide: { aspect: number; people: NormalizedBody[] };
  openpose: unknown;
  method?: 'limb-angle' | 'joint-distance';
  expected: unknown;
};

type MaskCase = {
  id: string;
  width: number;
  height: number;
  rgba: string;
  alpha: string;
  regrowEdges: boolean;
  fill: MaskRgb;
  expected: {
    alpha: string;
    filledHolePixels: number;
    regrownPixels: number;
    backdrop: MaskRgb | null;
    plainBackdrop: boolean;
    composite: string;
  };
};

const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'base64'));
const b64 = (data: Uint8Array | Uint8ClampedArray) =>
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');

describe('castcut shared vectors — pose check', () => {
  const cases = load<PoseCase>('pose-score.json');

  it('covers synthetic and real stills', () => {
    assert.ok(cases.filter(entry => entry.id.startsWith('real:')).length >= 30);
    assert.ok(cases.filter(entry => entry.id.startsWith('synthetic:')).length >= 30);
  });

  for (const entry of cases) {
    it(entry.id, () => {
      const detected = parseOpenPoseJson(entry.openpose);
      const actual = detected
        ? scorePoseMatch({
            guide: entry.guide.people,
            guideAspect: entry.guide.aspect,
            detected,
            ...(entry.method ? { method: entry.method } : {}),
          })
        : null;
      // Through JSON, as the vectors were written (undefined keys dropped).
      assert.deepEqual(JSON.parse(JSON.stringify(actual)), entry.expected);
    });
  }
});

describe('castcut shared vectors — mask repair', () => {
  for (const entry of load<MaskCase>('mask-repair.json')) {
    it(entry.id, () => {
      const rgba = bytes(entry.rgba);
      const repaired = repairSubjectMask(bytes(entry.alpha), rgba, entry.width, entry.height, {
        regrowEdges: entry.regrowEdges,
      });
      assert.equal(b64(repaired.alpha), entry.expected.alpha);
      assert.equal(repaired.filledHolePixels, entry.expected.filledHolePixels);
      assert.equal(repaired.regrownPixels, entry.expected.regrownPixels);
      assert.deepEqual(repaired.backdrop, entry.expected.backdrop);
      assert.equal(repaired.plainBackdrop, entry.expected.plainBackdrop);
      assert.equal(b64(compositeThroughMask(rgba, repaired.alpha, entry.fill)), entry.expected.composite);
    });
  }
});
