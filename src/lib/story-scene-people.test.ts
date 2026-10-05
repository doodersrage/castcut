import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { storyPoseForcePeople, storySceneNamesSecondPerson } from './story-scene-people';

describe('Story scene people', () => {
  it('counts a second person named by a plain noun', () => {
    for (const text of [
      'She pours coffee for the man beside her at the kitchen counter.',
      'Gloovi steps onto the train as a man in a velvet vest offers her a seat.',
      'Rook leans against a bookshelf while a barista hands him a pastry.',
      'sitting across a café table from her friend, both laughing over coffee',
      // The built-in "Uninvited guest" card: its still came out alone (live 2026-10-05).
      'A new person walks in on Tomas after rooftop run prep and changes the power dynamic.',
      // A role beside her, ending its phrase or going on with an -ing verb (live 2026-10-05).
      'Nora slips past a startled security guard, leaving behind a trail of glittering hourglasses.',
      'she nudges a glittering shard toward a startled security guard still clutching his walkie-talkie',
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
      'leaning against a brick wall waiting for a friend',
      'waving down a friend across the plaza, other hand holding an iced coffee',
      'texting her sister from the bus stop',
      'SEATED in a convertible passenger seat with the map open',
      'SEATED at a market stool trying on sunglasses from a vendor tray',
      'hands on hips outside the florist, a bunch of flowers tucked under one arm',
      'she sits behind the driver seat with the map open',
      'standing near the baker counter with a paper bag',
      undefined as unknown as string,
    ]) {
      assert.equal(storySceneNamesSecondPerson(text), false, text);
    }
  });

  it('Solo wins on an adult story, and a picked pose is left alone', () => {
    const text = 'She pours coffee for the man beside her.';
    assert.equal(storyPoseForcePeople({ text, adult: true, solo: true, playerPosed: false }), 1);
    assert.equal(storyPoseForcePeople({ text, adult: false, solo: true, playerPosed: false }), 2);
    assert.equal(storyPoseForcePeople({ text, adult: false, solo: false, playerPosed: true }), undefined);
  });
});
