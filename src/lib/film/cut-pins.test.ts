import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyCutShotEdits, type CutShotEdits, type KeyedShot } from './cut-plan';
import {
  cutSourceKeyOf,
  declineOfferedCutMedia,
  pinAllCutShots,
  pinEditedCutShots,
  pinnedCutShots,
  takeOfferedCutMedia,
  toggleCutShotPin,
} from './cut-pins';

const clip = (key: string, url: string, extra: Partial<KeyedShot> = {}): KeyedShot => ({
  key,
  title: 'Kitchen',
  url,
  kind: 'clip',
  thumbUrl: `${url}.jpg`,
  entryId: `${url}-entry`,
  ...extra,
});

describe('Cut pins its media (R5)', () => {
  it('a shot follows its source until it is edited, then keeps the media it was cut with', () => {
    const first = [clip('scenes:s1', '/take-1.mp4'), clip('day:morning', '/day-1.mp4')];
    const trimmed: CutShotEdits = { shots: { 'scenes:s1': { trimStartSec: 1.5 } } };
    const pinned = pinEditedCutShots(undefined, trimmed, first, 100);
    assert.equal(pinned?.shots?.['scenes:s1']?.pin?.url, '/take-1.mp4');
    assert.equal(pinned?.shots?.['scenes:s1']?.pin?.at, 100);
    assert.equal(pinned?.shots?.['day:morning'], undefined, 'the untouched shot is not pinned');

    // A new take is kept in Scene and the Day slot redone.
    const later = [clip('scenes:s1', '/take-2.mp4'), clip('day:morning', '/day-2.mp4')];
    const { shots, states } = pinnedCutShots({ shots: later, edits: pinned });
    assert.equal(shots[0]!.url, '/take-1.mp4', 'the edited shot keeps its media');
    assert.equal(shots[0]!.thumbUrl, '/take-1.mp4.jpg');
    assert.equal(shots[0]!.entryId, '/take-1.mp4-entry');
    assert.equal(states['scenes:s1']!.state, 'new-take');
    assert.equal(shots[1]!.url, '/day-2.mp4', 'the untouched one follows');
    assert.equal(states['day:morning']!.state, 'follows');
    // Its trim still applies, to the media it was set against.
    assert.equal(applyCutShotEdits(shots, pinned)[0]!.trimStartSec, 1.5);
  });

  it('leaving a shot out or moving it pins nothing; a second edit keeps the first pin', () => {
    const shots = [clip('scenes:s1', '/take-1.mp4')];
    const out = pinEditedCutShots(undefined, { shots: { 'scenes:s1': { include: false } } }, shots);
    assert.equal(out?.shots?.['scenes:s1']?.pin, undefined);
    const moved = pinEditedCutShots(undefined, { order: ['scenes:s1'] }, shots);
    assert.deepEqual(moved, { order: ['scenes:s1'] });
    const pinned = pinEditedCutShots(undefined, { shots: { 'scenes:s1': { volume: 0.5 } } }, shots, 1);
    const again = pinEditedCutShots(
      pinned,
      { shots: { 'scenes:s1': { ...pinned!.shots!['scenes:s1'], volume: 0.4 } } },
      [clip('scenes:s1', '/take-2.mp4')],
      2
    );
    assert.equal(again?.shots?.['scenes:s1']?.pin?.url, '/take-1.mp4');
    assert.equal(again?.shots?.['scenes:s1']?.pin?.at, 1);
  });

  it('added shots are never pinned (they hold their own media)', () => {
    const shots = [clip('x:abc', '/gallery.mp4')];
    assert.deepEqual(pinAllCutShots(undefined, shots), undefined);
    const edited = pinEditedCutShots(undefined, { shots: { 'x:abc': { volume: 0.2 } } }, shots);
    assert.equal(edited?.shots?.['x:abc']?.pin, undefined);
    assert.equal(pinnedCutShots({ shots }).states['x:abc'], undefined);
  });

  it('a version save or render pins every sourced shot not pinned yet', () => {
    const shots = [clip('scenes:s1', '/a.mp4'), clip('day:noon', '/b.mp4'), clip('x:t', '/c.png')];
    const before: CutShotEdits = {
      order: ['day:noon', 'scenes:s1'],
      shots: { 'scenes:s1': { pin: { url: '/old.mp4', kind: 'clip', at: 1 } } },
    };
    const all = pinAllCutShots(before, shots, 5);
    assert.equal(all?.shots?.['scenes:s1']?.pin?.url, '/old.mp4', 'an existing pin stays');
    assert.equal(all?.shots?.['day:noon']?.pin?.url, '/b.mp4');
    assert.equal(all?.shots?.['x:t'], undefined);
    assert.deepEqual(all?.order, ['day:noon', 'scenes:s1']);
  });

  it('use the new take here, or for every copy too; its trim is reset', () => {
    const edits: CutShotEdits = {
      shots: {
        'scenes:s1': { trimEndSec: 3, pin: { url: '/take-1.mp4', kind: 'clip', at: 1 } },
        'scenes:s1~2': { trimStartSec: 1, pin: { url: '/take-1.mp4', kind: 'clip', at: 1 } },
        'scenes:s9': { pin: { url: '/other.mp4', kind: 'clip', at: 1 } },
      },
    };
    const offered = clip('scenes:s1', '/take-2.mp4');
    const here = takeOfferedCutMedia(edits, 'scenes:s1', offered, { now: 9 });
    assert.deepEqual(here.keys, ['scenes:s1']);
    assert.equal(here.trimReset, true);
    assert.equal(here.edits?.shots?.['scenes:s1']?.pin?.url, '/take-2.mp4');
    assert.equal(here.edits?.shots?.['scenes:s1']?.trimEndSec, undefined);
    assert.equal(here.edits?.shots?.['scenes:s1~2']?.pin?.url, '/take-1.mp4', 'the copy stays');

    const everywhere = takeOfferedCutMedia(edits, 'scenes:s1', offered, { everywhere: true });
    assert.equal(everywhere.edits?.shots?.['scenes:s1~2']?.pin?.url, '/take-2.mp4');
    assert.equal(everywhere.edits?.shots?.['scenes:s1~2']?.trimStartSec, undefined);
    assert.equal(everywhere.edits?.shots?.['scenes:s9']?.pin?.url, '/other.mp4', 'other shots stay');
    assert.equal(cutSourceKeyOf('scenes:s1~12'), 'scenes:s1');
  });

  it('keep this one: no offer while the source holds the declined take', () => {
    const edits: CutShotEdits = {
      shots: { 'scenes:s1': { pin: { url: '/take-1.mp4', kind: 'clip', at: 1 } } },
    };
    const kept = declineOfferedCutMedia(edits, 'scenes:s1', '/take-2.mp4');
    const now = pinnedCutShots({ shots: [clip('scenes:s1', '/take-2.mp4')], edits: kept });
    assert.equal(now.states['scenes:s1']!.state, 'pinned');
    assert.equal(now.shots[0]!.url, '/take-1.mp4');
    // A third take is offered again.
    const third = pinnedCutShots({ shots: [clip('scenes:s1', '/take-3.mp4')], edits: kept });
    assert.equal(third.states['scenes:s1']!.state, 'new-take');
  });

  it('a pinned shot whose source is gone keeps playing; one merely outside this cut does not', () => {
    const edits: CutShotEdits = {
      shots: {
        'scenes:deleted': {
          pin: { url: '/kept.mp4', kind: 'clip', title: 'Rooftop', thumbUrl: '/kept.jpg', at: 1 },
        },
        'scenes:deleted~2': { pin: { url: '/kept.mp4', kind: 'clip', at: 1 } },
        'story:other-story@1': { pin: { url: '/beat.png', kind: 'still', at: 1 } },
        'scenes:unpinned': { volume: 0.5 },
      },
    };
    const { shots, states } = pinnedCutShots({
      shots: [],
      edits,
      isSourceGone: key => key === 'scenes:deleted' || key === 'scenes:unpinned',
    });
    assert.deepEqual(
      shots.map(shot => [shot.key, shot.title, shot.url]),
      [
        ['scenes:deleted', 'Rooftop', '/kept.mp4'],
        ['scenes:deleted~2', 'Shot', '/kept.mp4'],
      ]
    );
    assert.equal(states['scenes:deleted']!.state, 'source-gone');
    assert.equal(states['story:other-story@1'], undefined);
  });

  it('pin and unpin by hand', () => {
    const shot = clip('day:morning', '/day-1.mp4');
    const pinned = toggleCutShotPin({ shots: { 'day:morning': { volume: 0.3 } } }, shot, 4);
    assert.equal(pinned?.shots?.['day:morning']?.pin?.url, '/day-1.mp4');
    const unpinned = toggleCutShotPin(pinned, shot);
    assert.deepEqual(unpinned?.shots?.['day:morning'], { volume: 0.3 });
  });
});
