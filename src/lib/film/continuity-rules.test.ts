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

  // M8 T6: the audit's example — 6A carries the red umbrella; 7A, a minute later, doesn't.
  it('flags a shot that drops what an earlier shot at the same story time carries over', () => {
    const umbrella = { text: 'the red umbrella', carriesOver: true as const };
    const bandage = { text: 'left hand bandaged', carriesOver: true as const };
    const ids = (shots: RuleShot[]) =>
      crossShotFindings(shots)
        .filter(f => f.finding.rule === 'state-dropped')
        .map(f => [f.finding.id, f.finding.evidence]);
    const sixA = shot('scenes:6a', { time: 'evening', storyDay: 2, carries: [umbrella], changes: [bandage] });
    assert.deepEqual(ids([sixA, shot('scenes:7a', { time: 'evening', storyDay: 2, carries: [{ text: 'The red umbrella' }] })]), [
      ['scenes:7a:state-dropped', 'left hand bandaged (from “scenes:6a”) — not in this shot, at the same story time'],
    ]);
    // Another day, another time of day, another Cast, or not carried over: nothing.
    assert.deepEqual(ids([sixA, shot('scenes:7a', { time: 'evening', storyDay: 3 })]), []);
    assert.deepEqual(ids([sixA, shot('scenes:7a', { time: 'night', storyDay: 2 })]), []);
    assert.deepEqual(ids([sixA, shot('scenes:7a', { time: 'evening', storyDay: 2, castName: 'Ines' })]), []);
    assert.deepEqual(
      ids([
        shot('scenes:6a', { time: 'evening', carries: [{ text: 'the red umbrella' }] }),
        shot('scenes:7a', { time: 'evening' }),
      ]),
      []
    );
    // Several earlier shots carrying it: said once, from the first.
    const third = ids([sixA, { ...sixA, key: 'scenes:6b', title: 'scenes:6b' }, shot('scenes:7a', { time: 'evening', storyDay: 2, carries: [umbrella], changes: [bandage] }), shot('scenes:8a', { time: 'evening', storyDay: 2, changes: [bandage] })]);
    assert.deepEqual(third, [
      ['scenes:8a:state-dropped', 'the red umbrella (from “scenes:6a”) — not in this shot, at the same story time'],
    ]);
  });
});
