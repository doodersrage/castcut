import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crossShotFindings, type RuleShot } from './continuity-rules';

const shot = (key: string, state: Partial<RuleShot['state']>, extra: Partial<RuleShot> = {}): RuleShot => ({
  key,
  title: key,
  state: { castId: 'nora', castName: 'Nora', others: [], props: [], lookId: 'main', look: 'Main look', ...state },
  ...extra,
});

describe('cross-shot continuity rules (M2 C4)', () => {
  it('an outfit change between two shots at the same place and time, unstated, is flagged', () => {
    const findings = crossShotFindings([
      shot('day:morning', { place: 'kitchen', time: 'morning', outfit: 'Linen sundress' }),
      shot('scenes:s1', { place: 'Kitchen', time: 'morning', outfit: 'Red dress' }),
      // Another place: a change there is fine.
      shot('day:afternoon', { place: 'park', time: 'afternoon', outfit: 'Gym kit' }),
    ]);
    assert.deepEqual(
      findings.map(f => f.finding.id),
      ['scenes:s1:outfit-jump']
    );
    assert.match(findings[0]!.finding.evidence, /Linen sundress → Red dress/);
    assert.equal(findings[0]!.finding.severity, 'warns');
  });

  it('a stated change, another Cast or another time is not flagged', () => {
    const base = shot('day:morning', { place: 'kitchen', time: 'morning', outfit: 'Linen sundress' });
    assert.deepEqual(
      crossShotFindings([base, shot('a', { place: 'kitchen', time: 'morning', outfit: 'Robe', changeStated: true })]),
      []
    );
    assert.deepEqual(
      crossShotFindings([base, shot('b', { place: 'kitchen', time: 'morning', outfit: 'Robe', castName: 'Ines' })]),
      []
    );
    assert.deepEqual(
      crossShotFindings([base, shot('c', { place: 'kitchen', time: 'evening', outfit: 'Robe' })]),
      []
    );
    assert.deepEqual(crossShotFindings([base, shot('d', { place: 'kitchen', time: 'morning', outfit: 'Linen sundress' })]), []);
  });

  it('a look change counts too', () => {
    const findings = crossShotFindings([
      shot('a', { place: 'beach', time: 'afternoon' }),
      shot('b', { place: 'beach', time: 'afternoon', lookId: 'beach', look: 'Beach look' }),
    ]);
    assert.match(findings[0]!.finding.evidence, /Main look → Beach look/);
  });

  it('a shot rendered in another look than it uses now, and a drifted plate', () => {
    const findings = crossShotFindings(
      [shot('day:night', { lookId: 'main' }, { renderedLookId: 'old', renderedLookName: 'Winter look' })],
      { lookDrifted: (castId, lookId) => castId === 'nora' && lookId === 'main' }
    );
    assert.deepEqual(
      findings.map(f => f.finding.rule),
      ['look-mismatch', 'plate-drift']
    );
    assert.equal(findings[0]!.finding.evidence, 'Made in Winter look — it uses Main look now');
  });
});
