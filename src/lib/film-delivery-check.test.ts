import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  blackStats,
  cutChecksCoverage,
  cutChecksCoverageLine,
  dayCutNotes,
  mergeDeliveryProblems,
  parseMaxVolumeDb,
  shotDeliveryReasons,
  storyCutCoverageLine,
} from './film-delivery-check';

describe('shot delivery reasons', () => {
  it('names missing files, black pictures and silent talking clips', () => {
    assert.deepEqual(shotDeliveryReasons({ key: 'a', missing: 'not found' }, 'still'), [
      'the file is missing (not found)',
    ]);
    assert.deepEqual(shotDeliveryReasons({ key: 'a', missing: 'unreachable' }, 'clip'), [
      "couldn't read the file — is ComfyUI running?",
    ]);
    assert.deepEqual(shotDeliveryReasons({ key: 'a', blackShare: 1 }, 'still'), [
      'the picture is black',
    ]);
    assert.deepEqual(shotDeliveryReasons({ key: 'a', blackShare: 0.9 }, 'clip'), [
      'the clip is mostly black',
    ]);
    assert.deepEqual(shotDeliveryReasons({ key: 'a', blackShare: 0.2, blackRunSec: 2 }, 'clip'), [
      'the clip goes black for 2 s',
    ]);
    // A short fade is fine.
    assert.deepEqual(shotDeliveryReasons({ key: 'a', blackShare: 0.1, blackRunSec: 0.5 }, 'clip'), []);
    assert.deepEqual(
      shotDeliveryReasons({ key: 'a', hasAudio: false }, 'clip', { expectSpeech: true }),
      ["no sound — its line won't be heard"]
    );
    assert.deepEqual(
      shotDeliveryReasons({ key: 'a', hasAudio: true, maxVolumeDb: -60 }, 'clip', {
        expectSpeech: true,
      }),
      ["the sound is silent — its line won't be heard"]
    );
    // A motion clip with no line has no sound to miss.
    assert.deepEqual(shotDeliveryReasons({ key: 'a', hasAudio: false }, 'clip'), []);
    assert.deepEqual(shotDeliveryReasons(undefined, 'clip'), []);
  });

  it('measures black frames and the longest black run', () => {
    const frame = (value: number) => new Uint8Array(4).fill(value);
    const gray = new Uint8Array([
      ...frame(120),
      ...frame(5),
      ...frame(5),
      ...frame(5),
      ...frame(120),
    ]);
    const stats = blackStats(gray, 4, 2);
    assert.equal(stats?.frames, 5);
    assert.equal(stats?.blackShare, 0.6);
    assert.equal(stats?.blackRunSec, 1.5);
    assert.equal(blackStats(new Uint8Array(0), 4, 2), null);
  });

  it('reads volumedetect', () => {
    assert.equal(parseMaxVolumeDb('[Parsed_volumedetect_0] max_volume: -3.4 dB'), -3.4);
    assert.equal(parseMaxVolumeDb('max_volume: -inf dB'), Number.NEGATIVE_INFINITY);
    assert.equal(parseMaxVolumeDb('nothing'), null);
  });
});

describe('Day cut notes', () => {
  const slots = [
    { id: 'morning', label: 'Morning' },
    { id: 'afternoon', label: 'Afternoon', line: 'Hi there.' },
    { id: 'evening', label: 'Evening' },
    { id: 'night', label: 'Night' },
  ];

  it('says what the cut leaves out or falls back on', () => {
    const notes = dayCutNotes(slots, [
      { slotId: 'morning', status: 'completed', imageUrl: '/m.png', clipStatus: 'error' },
      { slotId: 'afternoon', status: 'completed', imageUrl: '/a.png' },
      { slotId: 'evening', status: 'running' },
    ]);
    assert.deepEqual(notes, [
      'Morning: the clip failed — its still is used',
      "Afternoon: its line won't be heard (no talking clip)",
      'Evening: still rendering — left out',
      'Night: not rendered — left out',
    ]);
  });

  it('is quiet when every slot has its clip', () => {
    const done = slots.map(slot => ({
      slotId: slot.id,
      status: 'completed' as const,
      imageUrl: '/s.png',
      clipStatus: 'completed' as const,
      clipUrl: '/c.mp4',
    }));
    assert.deepEqual(dayCutNotes(slots, done), []);
  });
});

describe('checks coverage', () => {
  it('lists what ran and what did not', () => {
    const coverage = cutChecksCoverage({ shotCount: 4, faceChecked: 3, poseChecked: 0, reviewOn: true });
    assert.deepEqual(coverage, { checked: ['faces 3 of 4', 'auto-review'], notChecked: ['pose'] });
    assert.equal(
      cutChecksCoverageLine(coverage),
      'Checked: faces 3 of 4, auto-review · Not checked: pose · files, black frames and sound are checked when you cut'
    );
  });

  it('counts Story matches only for the still shown now', () => {
    const line = storyCutCoverageLine(
      [
        { id: 'b', at: 1, imageUrl: '/x.png', faceMatch: { imageUrl: '/x.png' }, poseMatch: { imageUrl: '/old.png' } },
      ],
      ['b@1']
    );
    assert.match(line, /^Checked: faces · Not checked: pose/);
  });
});

describe('merging delivery problems', () => {
  it('adds file reasons to existing rows and new rows for clean shots', () => {
    const merged = mergeDeliveryProblems(
      [{ key: 'a', title: 'A', reasons: ['missed its pose'] }],
      [
        { key: 'a', title: 'A' },
        { key: 'b', title: 'B' },
      ],
      new Map([
        ['a', ['the picture is black']],
        ['b', ['the file is missing (not found)']],
      ])
    );
    assert.deepEqual(merged, [
      { key: 'a', title: 'A', reasons: ['the picture is black', 'missed its pose'] },
      { key: 'b', title: 'B', reasons: ['the file is missing (not found)'] },
    ]);
  });
});
