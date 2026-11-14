import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  NO_FINDING_BAR,
  measureReviewedSet,
  rerollRulesUnderBar,
  reviewedTakeEntry,
  type ReviewedLabels,
  type ReviewedSetMeasure,
  type ReviewedTake,
} from './reviewed-sets';

const DIR = path.join(process.cwd(), 'docs', 'consistency');
const read = <T>(name: string): T => JSON.parse(readFileSync(path.join(DIR, name), 'utf8')) as T;
const measure = (set: string): ReviewedSetMeasure =>
  measureReviewedSet(read<ReviewedTake[]>(`${set}-set.json`), read<ReviewedLabels>(`${set}-labels.json`));
const counts = (m: ReviewedSetMeasure) =>
  Object.fromEntries(m.rows.map(row => [row.rule, [row.found, row.right, row.wrong]]));

/**
 * The checks' numbers on the reviewed sets (docs/consistency-report.md). A change to a check that
 * moves them fails here until this record — and the report — say what it does now.
 */
describe('the checks on the reviewed sets (FINISHING_PLAN Phase 4)', () => {
  const v3 = measure('v3');
  const t5 = measure('t5');

  it('records each rule: found, right, wrong', () => {
    assert.deepEqual(counts(t5), {
      'pose-miss': [40, 17, 22],
      'outfit-miss': [13, 9, 4],
      'outfit-jump': [3, 0, 3],
    });
    assert.deepEqual(counts(v3), {
      // 30 at today's bar: V3 recorded a pose miss only when it was redone (D12); 11 undecided.
      'pose-miss': [30, 9, 10],
      'outfit-jump': [3, 3, 0],
    });
  });

  it('records the rejected takes no check flagged', () => {
    // T5: 27 rejected, 5 with no finding (one for the place, one place and hands, one hands, one
    // outfit at pose 0.98, one with no reason) — over the 10% bar: the place check never fired.
    // Lena's first take was never checked (it was rejected for the pose).
    assert.deepEqual([t5.rejected, t5.rejectedUnchecked, t5.rejectedNoFinding], [27, 1, 5]);
    assert.ok(t5.rejectedNoFinding / t5.rejected > NO_FINDING_BAR);
    const place = t5.misses.find(row => row.rule === 'place-miss');
    assert.deepEqual([place?.wrong, place?.missed], [2, 2]);
  });

  it('every check that rerolls is 70% precise, or is a recorded exception', () => {
    // Outfit check: 9 of 13 (69%), kept rerolling (user's choice, 2026-11-14): it flagged 12 of
    // the 13 takes rejected for the outfit, and an undressed take must never be kept as passing.
    const EXCEPTIONS: Record<string, string> = { 'outfit-miss': '9/13' };
    const under = rerollRulesUnderBar([v3, t5]);
    assert.deepEqual(
      under.filter(row => EXCEPTIONS[row.rule] !== `${row.right}/${row.decided}`),
      [],
      'a check that rerolls fell under the bar: raise it, or make it advise (RULE_ACTION)'
    );
  });

  it('reads a take as its checks left it; pose misses from the score at today’s bar', () => {
    assert.deepEqual(
      reviewedTakeEntry({
        promptId: 'p',
        pose: 0.34,
        poseMiss: false,
        autoReview: { outfitMiss: ' a blazer ', placeMiss: '', gestureMiss: 'holding the cup' },
      }),
      {
        promptId: 'p',
        playChecks: { at: 0, pose: 0.34, poseMiss: true, outfitMiss: 'a blazer', gestureMiss: 'holding the cup' },
      }
    );
    assert.deepEqual(reviewedTakeEntry({ promptId: 'q', checked: false }), { promptId: 'q' });
  });
});
