import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMarksRepairPrompt,
  checkableMarks,
  marksCheckVerdict,
  parseMarksCheck,
} from './cast-marks-check';
import type { CastMark } from './character-os';

const glasses: CastMark = { id: 'g', what: 'thin round wire-rimmed glasses', where: 'face' };
const rose: CastMark = { id: 'r', what: 'a small fine-line rose tattoo', where: 'left arm' };
const mole: CastMark = { id: 'm', what: 'a small dark beauty mole', where: 'face' };
const marks = [glasses, rose, mole];

// Real readings from the 2026-10-14 calibration (nsfwvision-qwen3-vl-8b).
const plain = '{"glasses":false,"tattoos":[{"where":"chest","what":"lace-up detail"},{"where":"stomach","what":"lace-up detail"}]}';
const spread = '{"glasses":true,"tattoos":[{"where":"left arm","what":"rose with thorns"},{"where":"right arm","what":"small floral design"}]}';
const good = '{"glasses":true,"tattoos":[{"where":"left arm","what":"rose with thorns"}]}';
const plate = '{"glasses":true,"tattoos":[{"where":"face","what":"small dot under lip"},{"where":"left arm","what":"rose with stem"}]}';

describe('marks check', () => {
  it('drops reads that are not ink (lace panels, a mole)', () => {
    assert.deepEqual(parseMarksCheck(plain)?.tattoos, []);
    assert.equal(parseMarksCheck(plate)?.tattoos.length, 1);
    assert.equal(parseMarksCheck('no json'), null);
  });

  it('judges only glasses and tattoos, where they show', () => {
    assert.deepEqual(
      checkableMarks(marks, { outfit: 'a tank top' }).map(mark => mark.id),
      ['g', 'r']
    );
    assert.deepEqual(
      checkableMarks(marks, { outfit: 'a long-sleeved sweater' }).map(mark => mark.id),
      ['g']
    );
  });

  it('passes the right still and the marked plate', () => {
    const expected = checkableMarks(marks, { outfit: 'a mini dress' });
    assert.equal(marksCheckVerdict(parseMarksCheck(good)!, expected, marks).ok, true);
    assert.equal(marksCheckVerdict(parseMarksCheck(plate)!, expected, marks).ok, true);
  });

  it('finds missing glasses and tattoo on a plain still, and the spread to the other arm', () => {
    const expected = checkableMarks(marks, { outfit: 'a mini dress' });
    const missing = marksCheckVerdict(parseMarksCheck(plain)!, expected, marks);
    assert.deepEqual(
      missing.issues.map(issue => issue.kind),
      ['missing-glasses', 'missing-tattoo']
    );
    const extra = marksCheckVerdict(parseMarksCheck(spread)!, expected, marks);
    assert.deepEqual(extra.issues, [{ kind: 'extra-tattoos', count: 1 }]);
  });

  it('asks for one short repair edit', () => {
    const expected = checkableMarks(marks, { outfit: 'a mini dress' });
    const issues = marksCheckVerdict(parseMarksCheck(plain)!, expected, marks).issues;
    assert.equal(
      buildMarksRepairPrompt(issues, marks),
      'Edit Image 1: put her thin round wire-rimmed glasses on her face; add a small fine-line rose tattoo on her left forearm. Keep everything else exactly — the same person, face, hair, pose, clothes, place and light. One person. Photoreal.'
    );
    const spreadIssues = marksCheckVerdict(parseMarksCheck(spread)!, expected, marks).issues;
    assert.match(buildMarksRepairPrompt(spreadIssues, marks), /remove every tattoo except a small fine-line rose tattoo on her left forearm/);
  });
});
