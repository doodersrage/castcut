import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CutShotEdits, KeyedShot } from './cut-plan';
import { backToEarlierCutTake, fitCutTrim, pinnedCutShots, takeOfferedCutMedia } from './cut-pins';

const clip = { kind: 'clip' as const };
const oldPin = { url: '/old.mp4', kind: 'clip' as const, entryId: 'old', at: 1 };
const offered: KeyedShot = { key: 'scenes:s1', title: 'Kitchen', url: '/new.mp4', kind: 'clip', entryId: 'new' };

describe('replacing a take keeps what it can (M4 F2)', () => {
  it('keeps a trim that fits, lets a long end go, resets one that can’t apply', () => {
    assert.equal(fitCutTrim({}, clip, 5).outcome, 'none');
    assert.deepEqual(fitCutTrim({ trimStartSec: 1, trimEndSec: 3 }, clip, 5), {
      edit: { trimStartSec: 1, trimEndSec: 3 },
      outcome: 'kept',
    });
    assert.deepEqual(fitCutTrim({ trimStartSec: 1, trimEndSec: 8 }, clip, 5), {
      edit: { trimStartSec: 1 },
      outcome: 'clamped',
    });
    assert.equal(fitCutTrim({ trimStartSec: 4.8 }, clip, 5).outcome, 'reset');
    assert.equal(fitCutTrim({ trimStartSec: 1 }, clip, null).outcome, 'reset', 'length unknown');
    assert.equal(fitCutTrim({ trimStartSec: 1 }, { kind: 'still' }, 5).outcome, 'reset');
  });

  it('uses the new take with its trim kept, and goes back to the earlier take and trim', () => {
    const edits: CutShotEdits = {
      shots: { 'scenes:s1': { caption: 'Hi', trimStartSec: 0.5, trimEndSec: 2, pin: oldPin } },
    };
    const used = takeOfferedCutMedia(edits, 'scenes:s1', offered, {
      offeredDurationSec: 4,
      now: 10,
    });
    assert.deepEqual(used.trims, { 'scenes:s1': 'kept' });
    assert.equal(used.trimReset, false);
    const after = used.edits!.shots!['scenes:s1']!;
    assert.equal(after.pin?.url, '/new.mp4');
    assert.deepEqual(after.pin?.previous, { ...oldPin, trimStartSec: 0.5, trimEndSec: 2 });
    assert.equal(after.trimEndSec, 2);
    // The card offers the way back while it plays the new take (and the source holds it).
    const state = pinnedCutShots({ shots: [offered], edits: used.edits }).states['scenes:s1'];
    assert.deepEqual(state, { state: 'pinned', earlier: true });

    const back = backToEarlierCutTake(used.edits, 'scenes:s1', 20)!.shots!['scenes:s1']!;
    assert.deepEqual(back, {
      caption: 'Hi',
      trimStartSec: 0.5,
      trimEndSec: 2,
      pin: { ...oldPin, declinedUrl: '/new.mp4', at: 20 },
    });
    // The declined new take is not offered again.
    assert.deepEqual(
      pinnedCutShots({ shots: [offered], edits: { shots: { 'scenes:s1': back } } }).states[
        'scenes:s1'
      ],
      { state: 'pinned' }
    );
  });

  it('with no earlier take, going back changes nothing', () => {
    const edits: CutShotEdits = { shots: { 'scenes:s1': { pin: oldPin } } };
    assert.equal(backToEarlierCutTake(edits, 'scenes:s1'), edits);
    assert.equal(backToEarlierCutTake(undefined, 'scenes:s1'), undefined);
  });
});
