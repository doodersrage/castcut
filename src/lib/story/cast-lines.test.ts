import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  storyCastLines,
  storyFamilyRomance,
  storyPeople,
  storyPeopleLine,
} from './cast-lines';

const people = storyPeople(
  {
    relationships: [
      { castId: 'sam', kind: 'sibling' },
      { castId: 'tomas', kind: 'partner' },
      { castId: 'gone', kind: 'friend' },
    ],
  },
  id => ({ sam: { name: 'Sam' }, tomas: { name: 'Tomas' } })[id as 'sam' | 'tomas']
);

describe('Story: the Cast in the writer and the stills', () => {
  it('tells the writer who the people are, family never romantic', () => {
    assert.equal(people.length, 2);
    assert.equal(
      storyPeopleLine(people),
      'People in her life, if they appear: Sam is her sibling (family — never romantic or sexual); Tomas is her partner.'
    );
    assert.match(storyPeopleLine(people, true), /^People in his life/);
    assert.equal(storyPeopleLine([]), '');
  });
  it('flags family in a romantic scene, or in any scene of an adult Story', () => {
    assert.equal(storyFamilyRomance('Sam and she share a slow kiss on the pier', people, false), 'Sam');
    assert.equal(storyFamilyRomance('She helps Sam carry boxes upstairs', people, false), null);
    assert.equal(storyFamilyRomance('She helps Sam carry boxes upstairs', people, true), 'Sam');
    assert.equal(storyFamilyRomance('Tomas kisses her neck', people, true), null);
  });
  it('says her props when the scene mentions them, for a man lead too', () => {
    const cast = { props: [{ id: 'p', name: 'dog', looks: 'a golden retriever with a red collar' }] };
    assert.match(
      storyCastLines(cast as never, { scene: 'She walks the dog along the river' }),
      /Her dog is a golden retriever/
    );
    assert.match(
      storyCastLines(cast as never, { scene: 'He walks the dog', man: true }),
      /His dog is a golden retriever/
    );
    assert.equal(storyCastLines(cast as never, { scene: 'She reads by the window' }), '');
  });
});

describe('Story: her place', async () => {
  const { storyPlaceLine } = await import('./cast-lines');
  it('sets a scene in her own kitchen in her apartment, not a castle bedroom', () => {
    const cast = { id: 'c1' };
    assert.match(storyPlaceLine(cast, 'She makes coffee in her kitchen at dawn'), /^The place is her apartment/);
    assert.equal(storyPlaceLine(cast, 'She sinks onto the bed in the castle tower'), '');
    assert.equal(storyPlaceLine(cast, 'She orders at the hotel bar'), '');
  });
});

describe('Story marks check order', async () => {
  const { nextStoryMarksCheck } = await import('../../hooks/roleplay/useStoryMarksCheck');
  it('checks a solo scene after its pose check, once per picture', () => {
    const base = { id: 'a', at: 1, title: 'A', blurb: '', stillStatus: 'completed', imageUrl: '/a.png' };
    const pose = { imageUrl: '/a.png', score: 0.8, expectedPeople: 1, detectedPeople: 1 };
    assert.equal(nextStoryMarksCheck([base as never]), null);
    assert.equal(nextStoryMarksCheck([{ ...base, poseMatch: pose } as never])?.id, 'a');
    assert.equal(
      nextStoryMarksCheck([{ ...base, poseMatch: { ...pose, expectedPeople: 2 } } as never]),
      null
    );
    assert.equal(
      nextStoryMarksCheck([
        { ...base, poseMatch: pose, marksCheck: { imageUrl: '/a.png', note: '' } } as never,
      ]),
      null
    );
  });
});
