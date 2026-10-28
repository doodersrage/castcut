import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { createScene, type SavedScene } from './scenes';
import { draftShots } from './script-shots';
import { storyboard } from './storyboard';

const script = parseScript(
  [
    'INT. KITCHEN - MORNING',
    '',
    'Nora pours coffee.',
    '',
    'NORA',
    'Coffee first.',
    '',
    'EXT. ROOFTOP - NIGHT',
    '',
    'The city hums.',
    '',
    'INT. HALL - NIGHT',
    '',
  ].join('\n')
);
const [kitchen, rooftop] = script.scenes;

const take = (id: string, review?: 'rejected') => ({
  id,
  promptId: id,
  imageUrl: `/img/${id}.png`,
  at: 1,
  ...(review ? { review } : {}),
});
const made = (id: string, takes: ReturnType<typeof take>[], keptTakeId?: string): SavedScene => ({
  ...createScene({ castId: 'nora', name: id, id, now: 1 }),
  takes,
  ...(keptTakeId ? { keptTakeId } : {}),
});

describe('the storyboard (M9 T3)', () => {
  it('lays out every planned shot in script order, with its kept take, a take, or a card', () => {
    const kitchenShots = draftShots(kitchen!);
    const rooftopShots = draftShots(rooftop!);
    const shots = [
      { ...kitchenShots[0]!, madeSceneId: 'scene-kept' },
      { ...kitchenShots[1]!, madeSceneId: 'scene-takes' },
      ...kitchenShots.slice(2),
      ...rooftopShots.map(shot => ({ ...shot, madeSceneId: 'scene-gone' })),
    ];
    const rows = storyboard({
      scenes: script.scenes,
      shots,
      made: [
        made('scene-kept', [take('t1'), take('t2')], 't1'),
        made('scene-takes', [take('t3'), take('t4', 'rejected')]),
      ],
    });
    // The hall has no shots planned: not on the board.
    assert.deepEqual(rows.map(row => row.scene.id), [kitchen!.id, rooftop!.id]);
    const [first, second] = rows[0]!.cards;
    assert.deepEqual([first!.label, first!.picture, first!.pictureUrl, first!.sceneId], ['1A', 'kept', '/img/t1.png', 'scene-kept']);
    // The latest take you didn't reject.
    assert.deepEqual([second!.picture, second!.pictureUrl], ['take', '/img/t3.png']);
    assert.match(second!.text, /NORA: “Coffee first\.”/);
    assert.equal(rows[0]!.cards.length, kitchenShots.length);
    // A Scene that is gone: a card, no Scene.
    const gone = rows[1]!.cards[0]!;
    assert.deepEqual([gone.picture, gone.sceneId, gone.kind], [undefined, undefined, 'Establishing · Wide (full body)']);
    assert.equal(gone.text, 'The city hums.');
  });

  it('is empty for a script with nothing planned', () => {
    assert.deepEqual(storyboard({ scenes: script.scenes, shots: undefined, made: [] }), []);
  });
});
