import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { storyPoseForcePeople, storySceneNamesSecondPerson } from './story-scene-people';

describe('Story scene people', () => {
  it('counts a second person named by a plain noun', () => {
    for (const text of [
      'She pours coffee for the man beside her at the kitchen counter.',
      'Gloovi steps onto the train as a man in a velvet vest offers her a seat.',
      'Rook leans against a bookshelf while a barista hands him a pastry.',
      'She hands a bouquet to the florist across the shop counter.',
    ]) {
      assert.equal(storySceneNamesSecondPerson(text), true, text);
    }
  });

  it('not a possession, an alone scene, or one the counter already reads as two', () => {
    for (const text of [
      "She wears the man's coat on the pier.",
      'She waits alone on the platform; a conductor’s whistle sounds far off.',
      'She and a friend sit side by side on a bench.',
      'She reads on the windowsill.',
    ]) {
      assert.equal(storySceneNamesSecondPerson(text), false, text);
    }
  });

  it('Solo wins on an adult story, and a picked pose is left alone', () => {
    const text = 'She hands a bouquet to the florist across the counter.';
    assert.equal(storyPoseForcePeople({ text, adult: true, solo: true, playerPosed: false }), 1);
    assert.equal(storyPoseForcePeople({ text, adult: false, solo: true, playerPosed: false }), 2);
    assert.equal(storyPoseForcePeople({ text, adult: false, solo: false, playerPosed: true }), undefined);
  });
});
