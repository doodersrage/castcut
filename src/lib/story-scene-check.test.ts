import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkStoryScene, leadPronounsInScene, repairStoryScene } from './story-scene-check';

const clean = { adult: false };

describe('Story scene check', () => {
  it('rewrites "they" for the lead, verbs included', () => {
    assert.equal(
      leadPronounsInScene(
        'Gloovi stands on the ledge as they lower their cup; they watch the drones from themselves.'
      ),
      'Gloovi stands on the ledge as she lowers her cup; she watches the drones from herself.'
    );
    assert.equal(
      leadPronounsInScene("They're tired, so they slowly turn and they can rest.", true),
      "He's tired, so he slowly turns and he can rest."
    );
    assert.equal(leadPronounsInScene('They are late and they carry a box.'), 'She is late and she carries a box.');
  });

  it('only when nobody else is in the scene', () => {
    const alone = { title: 'The ledge', blurb: 'Gloovi lowers their cup on the ledge.' };
    const withStranger = {
      title: 'The ledge',
      blurb: 'Gloovi and a stranger share a cup; they laugh at the drones.',
    };
    assert.deepEqual(checkStoryScene(alone, clean).map(issue => issue.code), ['lead-they']);
    assert.deepEqual(checkStoryScene(withStranger, clean), []);
    const fixed = repairStoryScene(alone, clean);
    assert.equal(fixed.scene.blurb, 'Gloovi lowers her cup on the ledge.');
    assert.deepEqual(fixed.repaired, ['lead-they']);
    assert.deepEqual(fixed.remaining, []);
  });

  it('flags a partner in a Solo story and sexual words on a clean one', () => {
    const partner = { title: 'Tangled', blurb: 'She straddles him on the couch.' };
    assert.deepEqual(
      checkStoryScene(partner, { adult: true, solo: true }).map(issue => issue.code),
      ['solo-names-partner']
    );
    assert.deepEqual(checkStoryScene(partner, { adult: true }), []);
    const sexual = { title: 'Joined', blurb: "The stranger's penetrating in sex hands." };
    assert.deepEqual(
      repairStoryScene(sexual, clean).remaining.map(issue => issue.code),
      ['sexual-on-clean']
    );
  });

  it('leaves an ordinary scene alone', () => {
    const scene = { title: 'The pier', blurb: 'She waves at the ferry from the pier.' };
    assert.deepEqual(checkStoryScene(scene, clean), []);
    assert.equal(repairStoryScene(scene, clean).scene, scene);
  });
});
