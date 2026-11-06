import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseStoryNotes,
  sceneSeconds,
  storyFeelingArc,
  storyNotesMessages,
  storyOutline,
} from './story-outline';

const beat = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, blurb: `${id} happens`, at: 1, ...extra });

describe('Story outline', () => {
  it('times a scene by its shot or its words', () => {
    assert.equal(sceneSeconds({}), 3);
    assert.equal(sceneSeconds({ clipStatus: 'completed' }), 5);
    assert.equal(sceneSeconds({ line: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen' }), 7);
  });

  it('runs the times and marks where the acts open', () => {
    const { scenes, totalSec } = storyOutline([beat('a'), beat('b'), beat('c'), beat('d')] as never);
    assert.equal(totalSec, 12);
    assert.deepEqual(scenes.map(s => [s.startSec, s.opensAct]), [
      [0, 1],
      [3, 2],
      [6, undefined],
      [9, 3],
    ]);
    assert.equal(storyOutline([beat('a'), beat('b')] as never).scenes[0]!.opensAct, undefined);
  });

  it('asks for JSON notes and reads them back', () => {
    const [system, user] = storyNotesMessages({ lead: 'Rae', tone: 'noir', beats: [beat('a', { line: 'Hi' })] as never });
    assert.match(system!.content, /JSON only/);
    assert.match(user!.content, /1\. a — a happens\n {3}Rae: “Hi”/);
    assert.deepEqual(parseStoryNotes('Sure! {"logline":"Rae wants out.","synopsis":"She leaves.","notes":["Scene 2 drags.", 4, ""]}'), {
      logline: 'Rae wants out.',
      synopsis: 'She leaves.',
      notes: ['Scene 2 drags.'],
    });
    assert.equal(parseStoryNotes('no json here'), null);
  });

  it('reads the emotion arc: each scene’s feeling, low to high, carried when unnamed', () => {
    const arc = storyFeelingArc([
      { title: 'Letter', blurb: 'a happy morning' },
      { title: 'Train', blurb: 'she travels' },
      { title: 'Café', blurb: 'she cries alone' },
      { title: 'Beach', blurb: 'they laugh and hug' },
    ] as never);
    assert.deepEqual(arc.map(point => [point.tone, point.valence]), [
      ['everyday', 1],
      ['everyday', 1],
      ['melancholy', -2],
      ['silly', 1.5],
    ]);
  });
});
