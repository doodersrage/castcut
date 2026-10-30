import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CutShotEdits, KeyedShot } from './cut-plan';
import {
  backToEarlierCutTake,
  CUT_EARLIER_TAKES,
  fitCutTrim,
  pinnedCutShots,
  takeOfferedCutMedia,
} from './cut-pins';

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

  it('goes back more than one take, one step at a time', () => {
    const take = (n: number): KeyedShot => ({
      key: 'scenes:s1',
      title: 'Kitchen',
      url: `/take${n}.mp4`,
      kind: 'clip',
    });
    let edits: CutShotEdits | undefined = { shots: { 'scenes:s1': { pin: { ...oldPin, url: '/take1.mp4' } } } };
    for (const n of [2, 3, 4]) {
      edits = takeOfferedCutMedia(edits, 'scenes:s1', take(n), { now: n }).edits;
    }
    const pin = () => edits!.shots!['scenes:s1']!.pin!;
    assert.equal(pin().url, '/take4.mp4');
    assert.equal(pin().previous?.url, '/take3.mp4');
    assert.deepEqual(pin().earlier?.map(entry => entry.url), ['/take2.mp4', '/take1.mp4']);
    for (const expected of ['/take3.mp4', '/take2.mp4', '/take1.mp4']) {
      edits = backToEarlierCutTake(edits, 'scenes:s1', 50);
      assert.equal(pin().url, expected);
    }
    assert.equal(pin().previous, undefined);
    assert.equal(pin().earlier, undefined);
    // Nothing further back.
    assert.equal(backToEarlierCutTake(edits, 'scenes:s1'), edits);
  });

  it('remembers at most a few takes back', () => {
    let edits: CutShotEdits | undefined = { shots: { 'scenes:s1': { pin: oldPin } } };
    for (let n = 0; n < CUT_EARLIER_TAKES + 4; n += 1) {
      edits = takeOfferedCutMedia(edits, 'scenes:s1', {
        key: 'scenes:s1',
        title: 'Kitchen',
        url: `/t${n}.mp4`,
        kind: 'clip',
      }).edits;
    }
    assert.equal(edits!.shots!['scenes:s1']!.pin!.earlier!.length, CUT_EARLIER_TAKES);
  });

  it('with no earlier take, going back changes nothing', () => {
    const edits: CutShotEdits = { shots: { 'scenes:s1': { pin: oldPin } } };
    assert.equal(backToEarlierCutTake(edits, 'scenes:s1'), edits);
    assert.equal(backToEarlierCutTake(undefined, 'scenes:s1'), undefined);
  });
});
