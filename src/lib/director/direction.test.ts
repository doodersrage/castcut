import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mjpegAvi, readAviHeader } from './avi';
import {
  addBeat,
  applyPreset,
  DIRECTOR_PRESETS,
  moveBeat,
  removeBeat,
  resizeBeat,
  setBeatTime,
  shiftBeat,
} from './edit';
import { poseSupport } from './figure-ops';
import {
  directionMotionLine,
  directionSeat,
  directionSupportNeeds,
  supportFix,
  supportWarning,
} from './motion-line';
import { DIRECTOR_MOVES } from './moves';
import { cleanSeat, seatStillPrompt, theSeat } from '@/lib/video/motion-seat';
import { poseBeat, standingFigure, starterFigure } from './poses';
import { migrateDirectionStore, normalizeDirectionList, withSavedDirection } from './store';
import { mergeRecordList, recordListSpec } from '@/lib/storage/record-list-sync';
import {
  checkDirection,
  DEFAULT_DIRECTOR_CAMERA,
  DIRECTOR_MAX_SECONDS,
  DIRECTOR_ONE_PART_SECONDS,
  directionLength,
  directionParts,
  normalizeDirection,
  type Direction,
} from './types';

const stand = standingFigure('female');

function direction(beats: Direction['beats'], body: Direction['body'] = 'female'): Direction {
  return { version: 1, body, beats, camera: DEFAULT_DIRECTOR_CAMERA };
}
const start = () => poseBeat('Stand', stand, { first: true });

describe('director: beats', () => {
  it('needs something to do, and no more than Copy moves takes', () => {
    assert.match(checkDirection(direction([start()])).errors[0]!, /Add a beat/);
    assert.deepEqual(checkDirection(direction([start(), moveBeat('wave')])).errors, []);
    const long = direction([
      start(),
      ...Array.from({ length: 8 }, () => moveBeat('reach', 4.2, 0)),
    ]);
    assert.ok(directionLength(long) > DIRECTOR_MAX_SECONDS);
    assert.match(checkDirection(long).errors.join(' '), /30 seconds/);
  });

  it('warns when Stand up does not follow a sit', () => {
    assert.match(checkDirection(direction([start(), moveBeat('stand')])).warnings[0]!, /after she sits/);
    assert.deepEqual(checkDirection(direction([start(), moveBeat('sit'), moveBeat('stand')])).warnings, []);
  });

  it('counts parts: about five seconds is one', () => {
    const one = direction([{ ...start(), hold: 0.4 }, moveBeat('wave', 2.2), moveBeat('turn', 2.4)]);
    assert.ok(directionLength(one) <= DIRECTOR_ONE_PART_SECONDS);
    assert.equal(directionParts(one), 1);
    assert.equal(directionParts(direction([start(), moveBeat('reach'), moveBeat('reach')])), 2);
  });

  it('edits: add, shift, remove (never the start), resize and set times', () => {
    let d = direction([start()]);
    d = addBeat(d, moveBeat('wave'));
    d = addBeat(d, moveBeat('nod'));
    assert.deepEqual(
      d.beats.map(b => (b.kind === 'move' ? b.move : b.name)),
      ['Stand', 'wave', 'nod']
    );
    assert.equal(shiftBeat(d, 1, -1), d, 'the start stays first');
    const shifted = shiftBeat(d, 2, -1);
    assert.equal(shifted.beats[1]!.kind === 'move' && shifted.beats[1]!.move, 'nod');
    assert.equal(removeBeat(d, 0), d);
    assert.equal(removeBeat(d, 1).beats.length, 2);
    // A move stretches up to twice its length, then holds.
    const wave = d.beats[1]!;
    const longer = resizeBeat(wave, 1, 7);
    assert.equal(longer.seconds, DIRECTOR_MOVES.wave.seconds * 2);
    assert.ok(Math.abs(longer.seconds + longer.hold - 7) < 0.011);
    assert.ok(resizeBeat(wave, 1, 0.1).seconds >= DIRECTOR_MOVES.wave.seconds * 0.6 - 1e-9);
    // A pose keeps its move-in and changes its hold; the start only holds.
    const pose = { ...poseBeat('P', stand), seconds: 1, hold: 0.5 };
    assert.deepEqual([resizeBeat(pose, 1, 3).seconds, resizeBeat(pose, 1, 3).hold], [1, 2]);
    assert.equal(resizeBeat(start(), 0, 2).hold, 2);
    assert.equal(setBeatTime(pose, 'hold', -3).hold, 0);
    assert.equal(setBeatTime(pose, 'seconds', 99).seconds, 6);
    assert.equal(setBeatTime(pose, 'seconds', Number.NaN), pose);
  });

  it('ready-made directions keep the start and fit about one part', () => {
    const base = direction([{ ...start(), name: 'Kneel' }]);
    for (const preset of DIRECTOR_PRESETS) {
      const d = applyPreset(base, preset);
      assert.equal(d.beats[0]!.kind === 'pose' && d.beats[0]!.name, 'Kneel');
      assert.ok(directionLength(d) <= DIRECTOR_ONE_PART_SECONDS + 0.01, preset.id);
      assert.deepEqual(checkDirection(d).errors, [], preset.id);
    }
  });

  it('normalizes a stored direction field by field', () => {
    const d = direction([start(), moveBeat('wave'), { ...poseBeat('P', stand), seconds: 1.5 }]);
    const back = normalizeDirection(JSON.parse(JSON.stringify(d)))!;
    assert.equal(back.beats.length, 3);
    assert.equal(back.beats[2]!.seconds, 1.5);
    assert.equal(normalizeDirection({ beats: [] }), null);
    assert.equal(normalizeDirection({ beats: [{ kind: 'move', move: 'wave' }] }), null, 'needs a start pose');
    const odd = normalizeDirection({
      ...d,
      beats: [d.beats[0], { kind: 'move', move: 'fly' }, { kind: 'move', move: 'wave', seconds: 99 }],
      camera: { height: 'sky', move: 'push-in' },
    })!;
    assert.equal(odd.beats.length, 2);
    assert.equal(odd.beats[1]!.seconds, DIRECTOR_MOVES.wave.seconds * 2);
    assert.equal(odd.camera.height, 'eye');
    assert.equal(odd.camera.move, 'push-in');
  });
});

describe('director: words', () => {
  it('builds the motion line from the beats', () => {
    const d = direction([start(), moveBeat('wave'), moveBeat('turn')]);
    assert.equal(directionMotionLine(d), 'A woman stands, then waves with her right hand, then turns around.');
    const man = direction([start(), moveBeat('look-back')], 'male');
    assert.equal(directionMotionLine(man), 'A man stands, then looks back over his left shoulder.');
    const posed = direction([start(), { ...poseBeat('Pose 2', stand), words: 'arms crossed' }]);
    assert.match(directionMotionLine(posed), /moves into a new pose — arms crossed\.$/);
    const many = direction([start(), ...Array.from({ length: 20 }, () => moveBeat('nod'))]);
    assert.ok(directionMotionLine(many).length <= 300);
  });

  it('reads which poses need a seat or something to lean on', () => {
    assert.equal(poseSupport(stand), null);
    assert.equal(poseSupport(starterFigure('sit', 'female')), 'sit');
    assert.equal(poseSupport(starterFigure('kneel', 'female')), null);
    assert.equal(poseSupport(starterFigure('lie', 'female')), null);
  });

  it('warns about a seat, and mentions Place once one is typed', () => {
    const d = direction([start(), moveBeat('wave'), moveBeat('sit')]);
    const notes = directionSupportNeeds(d);
    assert.deepEqual(notes.map(n => [n.index, n.support]), [[2, 'sit']]);
    assert.match(supportWarning(notes, '')!, /pick a still with a seat, or describe one in Place/);
    assert.match(supportWarning(notes, 'a kitchen')!, /make sure Place mentions a seat/);
    assert.equal(supportWarning(directionSupportNeeds(direction([start(), moveBeat('wave')])), ''), null);
    // Place that already has a seat needs no warning.
    assert.equal(supportWarning(notes, 'a kitchen with a wooden chair'), null);
  });

  it('offers a one-tap seat: a chair, a sofa when she sits back, a wall to lean on', () => {
    const d = direction([start(), moveBeat('sit')]);
    const notes = directionSupportNeeds(d);
    assert.deepEqual(supportFix(notes, ''), {
      label: 'Add a chair to Place',
      place: 'a wooden chair behind her',
    });
    const fix = supportFix(notes, 'a bright kitchen.', 'male')!;
    assert.equal(fix.place, 'a bright kitchen, with a wooden chair behind him');
    // The fixed Place silences the warning and needs no further fix.
    assert.equal(supportWarning(notes, fix.place), null);
    assert.equal(supportFix(notes, fix.place), null);
    assert.equal(supportFix([], ''), null);
    const reclined = [{ beatId: 'b', index: 1, support: 'sit' as const, reclined: true }];
    assert.equal(supportFix(reclined, '')!.place, 'a sofa behind her');
    const lean = [{ beatId: 'b', index: 1, support: 'lean' as const }];
    assert.deepEqual(supportFix(lean, 'a hallway'), {
      label: 'Add a wall to Place',
      place: 'a hallway, with a wall beside her',
    });
  });
});

describe('director: a seat put into the still', () => {
  it('offers a seat when a later beat sits, not when she already sits in the still', () => {
    const sits = directionSupportNeeds(direction([start(), moveBeat('wave'), moveBeat('sit')]));
    assert.equal(directionSeat(sits, ''), 'a wooden chair');
    assert.equal(directionSeat(sits, 'a bright kitchen'), 'a wooden chair');
    // The seat Place names.
    assert.equal(directionSeat(sits, 'a living room with two armchairs'), 'an armchair');
    assert.equal(directionSeat(sits, 'a park, benches'), 'a bench');
    assert.equal(directionSeat(sits, 'old stone steps'), 'some steps');
    const reclined = [{ beatId: 'b', index: 1, support: 'sit' as const, reclined: true }];
    assert.equal(directionSeat(reclined, ''), 'a sofa');
    // Sitting from the start: the still has her seat.
    const seated = [{ beatId: 'a', index: 0, support: 'sit' as const }, ...sits];
    assert.equal(directionSeat(seated, ''), null);
    assert.equal(directionSeat(directionSupportNeeds(direction([start(), moveBeat('wave')])), ''), null);
    assert.equal(directionSeat([{ beatId: 'b', index: 1, support: 'lean' as const }], ''), null);
  });

  it('says on what she sits in the motion line', () => {
    const d = direction([start(), moveBeat('sit')]);
    assert.match(directionMotionLine(d, 'a wooden chair'), /sits down on the wooden chair behind her\.$/);
    assert.doesNotMatch(directionMotionLine(d), /chair/);
    const him = { ...d, body: 'male' as const };
    assert.match(directionMotionLine(him, 'a sofa'), /A man stands, then sits down on the sofa behind him\.$/);
  });

  it('cleans the seat field and words the edit', () => {
    assert.equal(cleanSeat('  a wooden\n chair '), 'a wooden chair');
    assert.equal(cleanSeat(''), null);
    assert.equal(cleanSeat(3), null);
    assert.ok(cleanSeat('x'.repeat(200))!.length <= 80);
    assert.equal(theSeat('a wooden chair'), 'the wooden chair');
    assert.equal(theSeat('an armchair'), 'the armchair');
    assert.match(seatStillPrompt('a wooden chair'), /^Add a wooden chair standing on the floor directly behind the person, centered/);
    assert.match(seatStillPrompt('a sofa'), /Keep the person, face/);
  });
});

describe('director: video and saving', () => {
  it('wraps JPEG frames in a Motion-JPEG AVI ffmpeg reads', () => {
    const frames = [new Uint8Array([0xff, 0xd8, 1, 0xff, 0xd9]), new Uint8Array([0xff, 0xd8, 0xff, 0xd9])];
    const avi = mjpegAvi(frames, { width: 464, height: 832, fps: 16 });
    assert.deepEqual(readAviHeader(avi), { width: 464, height: 832, fps: 16, frames: 2 });
    const text = new TextDecoder('latin1').decode(avi);
    assert.equal(text.slice(0, 4), 'RIFF');
    assert.equal(new DataView(avi.buffer).getUint32(4, true), avi.length - 8);
    assert.equal((text.match(/00dc/g) ?? []).length, 4, 'two frames and two index entries');
    assert.ok(text.includes('MJPG') && text.includes('idx1'));
    assert.throws(() => mjpegAvi([], { width: 1, height: 1, fps: 16 }));
  });

  it('keeps saved directions per Cast, newest first, one per name', () => {
    const d = direction([start(), moveBeat('wave')]);
    let list = withSavedDirection([], 'cast1', 'Hello', d, 1);
    list = withSavedDirection(list, 'cast1', 'Bye', d, 2);
    list = withSavedDirection(list, 'cast2', 'Hello', d, 3);
    const first = list.find(e => e.castId === 'cast1' && e.name === 'Hello')!;
    list = withSavedDirection(list, 'cast1', 'hello', d, 4);
    assert.deepEqual(
      list.map(e => [e.castId, e.name]),
      [
        ['cast1', 'hello'],
        ['cast1', 'Bye'],
        ['cast2', 'Hello'],
      ]
    );
    // Saved again under its name: the same entry, so another device sees an edit.
    assert.equal(list[0]!.id, first.id);
    assert.equal(withSavedDirection([], null, 'x', d, 1)[0]!.castId, '_');
    const clean = normalizeDirectionList([...list, { name: 'broken' }, 4]);
    assert.equal(clean.length, 3);
    assert.deepEqual(normalizeDirectionList({ a: 1 }), []);
  });

  it('moves the browser-only store into the synced list once', () => {
    const d = direction([start(), moveBeat('wave')]);
    const v1 = {
      cast1: [{ id: 'a', name: 'Wave', direction: d, savedAt: 10 }],
      _: [{ id: 'b', name: 'Bow', direction: d, savedAt: 20 }, { name: 'broken' }],
      junk: 4,
    };
    const list = migrateDirectionStore(v1);
    assert.deepEqual(
      list.map(e => [e.id, e.castId, e.name, e.updatedAt]),
      [
        ['b', '_', 'Bow', 20],
        ['a', 'cast1', 'Wave', 10],
      ]
    );
    assert.deepEqual(migrateDirectionStore([1, 2]), []);
    assert.deepEqual(migrateDirectionStore(null), []);
  });

  it('merges across devices like My poses: newest copy wins, deletions travel', () => {
    const d = direction([start(), moveBeat('wave')]);
    const spec = recordListSpec('directorDirections');
    const phone = withSavedDirection([], 'cast1', 'Wave', d, 10);
    const desk = withSavedDirection([], 'cast1', 'Turn', d, 20);
    const both = mergeRecordList(spec, desk, phone, undefined);
    assert.deepEqual(
      both.map(e => e.name),
      ['Turn', 'Wave']
    );
    const gone = mergeRecordList(spec, both, [], { [phone[0]!.id]: 30 });
    assert.deepEqual(
      gone.map(e => e.name),
      ['Turn']
    );
    // The same name for the same Cast member saved on two devices: one, the newest.
    const again = withSavedDirection([], 'cast1', 'turn', d, 40);
    assert.deepEqual(
      mergeRecordList(spec, desk, again, undefined).map(e => e.name),
      ['turn']
    );
  });
});
