import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { dayAsShort } from './day-as-short';
import { createScene, type SavedScene } from './scenes';
import { draftShots } from './script-shots';
import { shortMomentHasMore, shortMomentsOf, shortSlotOrder } from './short-moments';

const day = {
  stillsCharacterId: 'mara',
  dayLength: 4,
  slots: [
    { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee by the window', line: 'Coffee first.' },
    { id: 'afternoon', label: 'Afternoon', location: 'beach', sceneHints: 'walks along the water' },
    { id: 'evening', label: 'Evening' },
    { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
  ],
  stills: [{ slotId: 'morning', promptId: 'p-m', imageUrl: '/m.png', status: 'completed' }],
} as unknown as DayToolCache;

describe('a Short’s moments from its script (Step 5a)', () => {
  it('reads today’s short as one-shot scenes: its line, its Scene, the kept still, the board moment', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const moments = shortMomentsOf({ ...short.script, shots: short.shots }, short.scenes);
    assert.deepEqual(
      moments.map(moment => moment.heading),
      ['INT. KITCHEN - MORNING', 'EXT. BEACH - DAY', 'INT. BEDROOM - NIGHT']
    );
    const [morning, beach] = moments;
    assert.deepEqual(morning!.action, ['pours coffee by the window']);
    assert.deepEqual(morning!.lines, [{ speaker: 'MARA', text: 'Coffee first.' }]);
    assert.equal(morning!.shots.length, 1);
    assert.equal(morning!.shots[0]!.scene?.fromDaySlot, 'morning');
    assert.equal(morning!.shots[0]!.kept?.imageUrl, '/m.png');
    assert.equal(morning!.rendered, 1);
    assert.equal(morning!.daySlot, 'morning');
    assert.equal(beach!.rendered, 0);
    assert.deepEqual(beach!.lines, []);
    assert.deepEqual(beach!.loose, []);
  });

  it('reads a scene with two speakers and several shots, each shot its own Scene', () => {
    const source = [
      'Title: Rooftop',
      '',
      'EXT. ROOFTOP - NIGHT',
      '',
      'Mara leans on the rail. Theo brings two cups.',
      '',
      'THEO',
      '(quietly)',
      'You came.',
      '',
      'MARA',
      'I said I would.',
      '',
      'NARRATOR (V.O.)',
      'She almost didn’t.',
      '',
    ].join('\n');
    const scene = parseScript(source).scenes[0]!;
    const shots = draftShots(scene).map((shot, index) => ({
      ...shot,
      ...(index < 2 ? { madeSceneId: `s-${index}` } : {}),
    }));
    assert.ok(shots.length >= 3);
    const fromScript = (index: number) => ({ scriptId: 'roof', sceneId: scene.id, shotId: shots[index]!.id });
    const made: SavedScene[] = [0, 1].map(index => ({
      ...createScene({ castId: 'mara', name: `Shot ${index + 1}`, id: `s-${index}`, fromScript: fromScript(index), now: 10 }),
      takes: [{ id: `t-${index}`, imageUrl: `/r${index}.png`, at: 20 }],
      keptTakeId: `t-${index}`,
    })) as SavedScene[];
    // The third shot found by the Scene's own link (its shot lost its madeSceneId).
    const third = { ...createScene({ castId: 'mara', name: 'Shot 3', id: 's-2', fromScript: fromScript(2), now: 11 }) };
    // A Scene of this scene no planned shot points at (re-planned away): listed, not dropped.
    const loose = createScene({
      castId: 'mara',
      name: 'Old shot',
      id: 's-old',
      fromScript: { scriptId: 'roof', sceneId: scene.id, shotId: 'gone' },
      now: 12,
    });
    // Another script's Scene is not this short's.
    const other = createScene({ castId: 'mara', name: 'Else', id: 's-x', fromScript: { scriptId: 'other', sceneId: scene.id, shotId: shots[0]!.id }, now: 13 });
    const [moment] = shortMomentsOf({ id: 'roof', source, shots }, [...made, third, loose, other]);
    assert.ok(moment);
    assert.deepEqual(moment.speakers, ['THEO', 'MARA', 'NARRATOR']);
    assert.deepEqual(moment.lines, [
      { speaker: 'THEO', text: 'You came.', how: 'quietly' },
      { speaker: 'MARA', text: 'I said I would.' },
      { speaker: 'NARRATOR', text: 'She almost didn’t.', offscreen: true },
    ]);
    assert.equal(moment.dayPart, 'night');
    assert.equal(moment.shots.length, shots.length);
    assert.deepEqual(moment.shots.slice(0, 3).map(entry => entry.scene?.id), ['s-0', 's-1', 's-2']);
    assert.equal(moment.rendered, 2);
    assert.deepEqual(moment.loose.map(entry => entry.id), ['s-old']);
    assert.equal(moment.daySlot, undefined);
  });

  it('gives a Scene to one shot only, and reads a script with no shots planned', () => {
    const source = 'INT. KITCHEN - DAY\n\nShe waits.\n';
    const scene = parseScript(source).scenes[0]!;
    const made = createScene({ castId: 'mara', name: 'A', id: 'a', fromScript: { scriptId: 'k', sceneId: scene.id, shotId: 'x' }, now: 1 });
    const twice = [
      { id: 'x', sceneId: scene.id, purpose: 'action' as const, framing: 'full' as const, who: [], seconds: 3, madeSceneId: 'a' },
      { id: 'y', sceneId: scene.id, purpose: 'action' as const, framing: 'waist' as const, who: [], seconds: 3, madeSceneId: 'a' },
    ];
    const [moment] = shortMomentsOf({ id: 'k', source, shots: twice }, [made]);
    assert.deepEqual(moment!.shots.map(entry => entry.scene?.id), ['a', undefined]);
    const [unplanned] = shortMomentsOf({ id: 'k', source }, [made]);
    assert.deepEqual(unplanned!.shots, []);
    assert.deepEqual(unplanned!.loose.map(entry => entry.id), ['a']);
    assert.deepEqual(unplanned!.action, ['She waits.']);
  });

  it('says a card has more to show only for another voice, a second line or a second shot', () => {
    const short = dayAsShort({ day, castId: 'mara', leadName: 'Mara', now: 1000 })!;
    const [morning] = shortMomentsOf({ ...short.script, shots: short.shots }, short.scenes);
    // Today's moment: the lead's one line, one shot — the card already says it all.
    assert.equal(shortMomentHasMore(morning, ['MARA']), false);
    assert.equal(shortMomentHasMore(undefined, ['MARA']), false);
    assert.equal(shortMomentHasMore({ ...morning!, lines: [{ speaker: 'THEO', text: 'Hi.' }] }, ['MARA']), true);
    assert.equal(shortMomentHasMore({ ...morning!, lines: [...morning!.lines, { speaker: 'MARA', text: 'More.' }] }, ['MARA']), true);
    assert.equal(shortMomentHasMore({ ...morning!, shots: [...morning!.shots, ...morning!.shots] }, ['MARA']), true);
  });
});

describe('the board in its script’s order (Step 5f)', () => {
  it('takes the script’s scene order; a moment with no scene stays after the one it followed', () => {
    assert.deepEqual(
      shortSlotOrder(
        ['morning', 'afternoon', 'evening', 'night'],
        [{ daySlot: 'night' }, { daySlot: 'morning' }, {}, { daySlot: 'afternoon' }]
      ),
      // The evening (no scene) followed the afternoon on the board.
      ['night', 'morning', 'afternoon', 'evening']
    );
    // Nothing in the script: the board as it is.
    assert.deepEqual(shortSlotOrder(['morning', 'night'], []), ['morning', 'night']);
    // A scene of a moment the board doesn't have, and one named twice, are left out.
    assert.deepEqual(
      shortSlotOrder(['morning', 'night'], [{ daySlot: 'night' }, { daySlot: 'evening' }, { daySlot: 'night' }, { daySlot: 'morning' }]),
      ['night', 'morning']
    );
    // An empty first card stays first.
    assert.deepEqual(shortSlotOrder(['morning', 'afternoon', 'night'], [{ daySlot: 'night' }, { daySlot: 'afternoon' }]), ['morning', 'night', 'afternoon']);
  });
});
