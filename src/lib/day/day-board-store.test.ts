import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DayToolCache } from '../play/settings';
import {
  dayAsShort,
  dayShortFingerprint,
  shortEditClashes,
  shortScenesUnedited,
  shortScenesWithBoard,
} from './day-as-short';
import { normalizeSavedScenes, upsertScene, type SavedScene } from './scenes';
import { storedDayBoard, wholeDayBoard } from './day-board-store';

const day = {
  stillsCharacterId: 'mara',
  dayLength: 4,
  slots: [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee by the window', line: 'Coffee first.' },
    { id: 'afternoon', label: 'Afternoon', location: 'beach', sceneHints: 'walks along the water', eventMove: 'puts down her cup' },
    { id: 'evening', label: 'Evening' },
    { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
  ],
  stills: [{ slotId: 'morning', promptId: 'p-m', imageUrl: '/m.png', status: 'completed' }],
} as unknown as DayToolCache;
const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
const linked = {
  ...day,
  shortLink: { castId: 'mara', scriptId: short.script.id, fingerprint: dayShortFingerprint(day), syncedAt: 1000 },
} as DayToolCache;
const by = (board: DayToolCache, id: string) => board.slots!.find(slot => slot.id === id)!;
/** As it goes through the settings store (JSON). */
const stored = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const sameMoments = (board: DayToolCache) => {
  for (const slot of linked.slots!) {
    const back = by(board, slot.id) as Record<string, unknown>;
    for (const [key, value] of Object.entries(slot)) assert.deepEqual(back[key], value, `${slot.id}.${key}`);
  }
};

describe('the Short’s board stored slim (Step 5f part 3b)', () => {
  it('stores a linked board slim and reads it back whole, in step', () => {
    const slim = stored(storedDayBoard(linked, short.scenes));
    assert.deepEqual(by(slim, 'morning'), { id: 'morning' });
    assert.deepEqual(by(slim, 'afternoon'), { id: 'afternoon', eventMove: 'puts down her cup' });
    const whole = wholeDayBoard(slim, short.scenes);
    sameMoments(whole);
    assert.deepEqual(whole.stills, linked.stills);
    // In step: the page holding it has no edit waiting.
    assert.equal(whole.shortLink!.fingerprint, dayShortFingerprint(whole));
  });

  it('stores whole what wouldn’t read back the same: an edit waiting, no link', () => {
    const waiting = { ...linked, slots: linked.slots!.map(slot => (slot.id === 'night' ? { ...slot, sceneHints: 'cooks' } : slot)) } as DayToolCache;
    assert.equal(storedDayBoard(waiting, short.scenes), waiting);
    assert.equal(storedDayBoard(day, short.scenes), day);
    assert.equal(wholeDayBoard(day, short.scenes), day);
  });

  it('a change written over the board read whole (a new take) never leaves an empty card', () => {
    // What saveToolSettings('day', { stills }) does: the change onto the board as read.
    const slim = stored(storedDayBoard(linked, short.scenes));
    const read = wholeDayBoard(slim, short.scenes);
    const changed = {
      ...read,
      stills: [...read.stills!, { slotId: 'night', promptId: 'p-n', imageUrl: '/n.png', status: 'completed' }],
    } as DayToolCache;
    const next = stored(storedDayBoard(changed, short.scenes));
    // Not in step with its link any more (the board writes it into the short); its Scenes hold
    // every card, so slim still (part 3c) — and read back whole, the new take and the edit waiting.
    const back = wholeDayBoard(next, short.scenes);
    sameMoments(back);
    assert.deepEqual(back.stills, changed.stills);
    assert.equal(back.shortLink!.fingerprint, linked.shortLink!.fingerprint);
    assert.notEqual(dayShortFingerprint(back), back.shortLink!.fingerprint);
  });

  it('fills a slim card its Scene holds even when the stored copy is out of step with its link', () => {
    const slim = stored(storedDayBoard(linked, short.scenes));
    // Something wrote over the slim copy what its link didn't see (the mood, from another tab).
    const outOfStep = { ...slim, dayMood: 'intimate' } as DayToolCache;
    assert.notEqual(dayShortFingerprint(outOfStep), outOfStep.shortLink!.fingerprint);
    const whole = wholeDayBoard(outOfStep, short.scenes);
    sameMoments(whole);
    assert.deepEqual(whole.stills, linked.stills);
  });

  it('keeps a card whole once its Scene is gone (Scene → Delete saves it whole first)', () => {
    const slim = stored(storedDayBoard(linked, short.scenes));
    const read = wholeDayBoard(slim, short.scenes);
    const rest = short.scenes.filter(scene => scene.fromDaySlot !== 'night');
    // keepShortCardOf: the board as read before the delete, saved after it.
    const next = stored(storedDayBoard({ ...wholeDayBoard(slim, rest), slots: read.slots, shortLink: read.shortLink } as DayToolCache, rest));
    assert.equal(by(next, 'night').sceneHints, 'reads in bed');
    assert.deepEqual(by(next, 'morning'), { id: 'morning' });
    sameMoments(wholeDayBoard(next, rest));
    // Without it, the slim card would read empty: its Scene said what it was.
    assert.equal(by(wholeDayBoard(slim, rest), 'night').sceneHints, undefined);
  });
});

describe('the board’s edits into its Scenes at once (Step 5f part 3c)', () => {
  const link = { castId: 'mara', scriptId: short.script.id };
  const edited = {
    ...linked,
    slots: linked.slots!.map(slot =>
      slot.id === 'night' ? { ...slot, sceneHints: 'reads in bed by lamplight' } : slot
    ),
  } as DayToolCache;
  const into = (scenes: readonly SavedScene[], day: DayToolCache) =>
    (shortScenesWithBoard({ day, scenes, link, now: 5000 }) ?? []).reduce(
      (all, scene) => upsertScene(all, scene),
      [...scenes]
    );
  const tied = (scenes: readonly SavedScene[], slotId: string) =>
    scenes.find(scene => scene.fromDaySlot === slotId)!;

  it('writes a card’s edit into its Scene, keeping the card as the script last took it', () => {
    const scenes = into(short.scenes, edited);
    assert.equal(tied(scenes, 'night').slot.sceneHints, 'reads in bed by lamplight');
    assert.equal(tied(scenes, 'night').shortSynced?.sceneHints, 'reads in bed');
    // Only that card's Scene.
    assert.equal(tied(scenes, 'morning'), tied(short.scenes, 'morning'));
    // Stored and read back (normalised) it keeps both.
    const back = tied(normalizeSavedScenes(JSON.parse(JSON.stringify(scenes))), 'night');
    assert.equal(back.shortSynced?.sceneHints, 'reads in bed');
    // A card put back as the script has it: no edit waiting on the Scene any more.
    const again = into(scenes, linked);
    assert.equal(tied(again, 'night').slot.sceneHints, 'reads in bed');
    assert.equal(tied(again, 'night').shortSynced, undefined);
    assert.equal(shortScenesWithBoard({ day: linked, scenes: short.scenes, link }), null);
  });

  it('leaves the Scene open on Scene, and a card with no Scene, alone', () => {
    const night = tied(short.scenes, 'night');
    assert.equal(shortScenesWithBoard({ day: edited, scenes: short.scenes, link, skip: night.id }), null);
    const loose = short.scenes.filter(scene => scene.id !== night.id);
    assert.equal(shortScenesWithBoard({ day: edited, scenes: loose, link }), null);
  });

  it('the script’s update then writes the same as without it — and the Scenes lose the mark', () => {
    const existing = (scenes: readonly SavedScene[]) => ({ script: short.script, scenes });
    const plain = dayAsShort({ day: edited, castId: 'mara', leadName: 'Mara', now: 9000, existing: existing(short.scenes) })!;
    const early = dayAsShort({ day: edited, castId: 'mara', leadName: 'Mara', now: 9000, existing: existing(into(short.scenes, edited)) })!;
    assert.match(plain.script.source, /lamplight/);
    assert.equal(early.script.source, plain.script.source);
    assert.deepEqual(early.shots, plain.shots);
    const strip = (scenes: SavedScene[]) => scenes.map(({ updatedAt: _at, ...scene }) => scene);
    assert.deepEqual(strip(early.scenes), strip(plain.scenes));
    assert.ok(early.scenes.every(scene => !scene.shortSynced));
  });

  it('a clash is still a clash: the script and the card both changed the beat', () => {
    const scenes = into(short.scenes, edited);
    const script = {
      ...short.script,
      source: short.script.source.replace('reads in bed', 'sleeps at last'),
    };
    const input = { day: edited, script, castId: 'mara', leadName: 'Mara' };
    assert.deepEqual(shortEditClashes({ ...input, scenes }), shortEditClashes({ ...input, scenes: short.scenes }));
    assert.equal(shortEditClashes({ ...input, scenes }).length, 1);
  });

  it('the script kept as it is puts its Scenes back', () => {
    const scenes = into(short.scenes, edited);
    const back = shortScenesUnedited(scenes, short.script.id, 7000)!;
    assert.equal(back.length, 1);
    assert.equal(back[0]!.slot.sceneHints, 'reads in bed');
    assert.equal(back[0]!.shortSynced, undefined);
    assert.equal(shortScenesUnedited(short.scenes, short.script.id), null);
  });

  it('stores a board with an edit waiting slim once its Scenes hold it, and reads it back waiting', () => {
    // Before the Scenes take it: whole, as before.
    assert.equal(storedDayBoard(edited, short.scenes), edited);
    const scenes = into(short.scenes, edited);
    const slim = stored(storedDayBoard(edited, scenes));
    assert.deepEqual(by(slim, 'night'), { id: 'night' });
    assert.equal(slim.shortLink!.fingerprint, linked.shortLink!.fingerprint);
    const whole = wholeDayBoard(slim, scenes);
    assert.equal(by(whole, 'night').sceneHints, 'reads in bed by lamplight');
    assert.equal(by(whole, 'morning').line, 'Coffee first.');
    // Still waiting: the board writes it into the script.
    assert.equal(whole.shortLink!.fingerprint, linked.shortLink!.fingerprint);
    assert.equal(dayShortFingerprint(whole), dayShortFingerprint(edited));
    assert.notEqual(dayShortFingerprint(whole), whole.shortLink!.fingerprint);
  });
});

