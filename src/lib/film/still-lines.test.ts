import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScene, sceneCutShots, sceneStillFraming } from '../day/scenes';
import { applyCutShotEdits } from './cut-plan';
import { baseVoiceLine, speakerSeed, stillLineOf } from './still-lines';

describe('reading the lines on stills', () => {
  it('reads the lead’s line, else the other person’s from the beat, on stills only', () => {
    assert.deepEqual(stillLineOf({ kind: 'still', spoken: 'Coffee first.' }), {
      text: 'Coffee first.',
      speaker: { lead: true },
    });
    assert.deepEqual(
      stillLineOf({ kind: 'still', caption: 'He leans on the counter. Rob says: “You came back.”' }),
      { text: 'You came back.', speaker: { lead: false, name: 'Rob' } }
    );
    assert.equal(stillLineOf({ kind: 'clip', spoken: 'Coffee first.' }), null);
    assert.equal(stillLineOf({ kind: 'still', caption: 'She looks out to sea.' }), null);
  });

  it('finds the lead’s line on a Scene’s kept still, as Cut gets it (not only on clips)', () => {
    // The overnight episode read only Rob's lines: a Scene's still never carried hers.
    const scene = {
      ...createScene({ castId: 'lena', name: '2B KITCHEN · Dialogue', id: 'scene-l', now: 1 }),
      takes: [{ id: 'k', promptId: 'k', imageUrl: '/k.png', at: 1 }],
      keptTakeId: 'k',
    };
    scene.slot = { ...scene.slot, line: 'You didn’t bring the recipe.' };
    const [shot] = sceneCutShots([scene], 'lena');
    assert.equal(shot!.kind, 'still');
    assert.equal(shot!.spoken, undefined, 'not heard or subtitled unless it is read');
    assert.deepEqual(stillLineOf(shot!), {
      text: 'You didn’t bring the recipe.',
      speaker: { lead: true },
    });
  });

  it('keeps one seed a speaker (a new seed was a new voice each line), apart from the others', () => {
    assert.equal(speakerSeed('char-rob'), speakerSeed(' CHAR-ROB '));
    assert.notEqual(speakerSeed('char-rob'), speakerSeed('char-lena'));
    assert.notEqual(speakerSeed('man:Customer'), speakerSeed('man:Rob'));
    const seed = speakerSeed('char-rob');
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 1_000_000_000);
  });

  it('gives a base voice a few seconds of their own words', () => {
    assert.equal(
      baseVoiceLine('Rob Hale'),
      'Hi, I’m Rob. This is how I sound when I talk — easy, clear, and just like this.'.replace('’', "'")
    );
  });

  it('frames a Scene’s still in the cut as its shot was planned, never a two-person one', () => {
    const base = {
      ...createScene({ castId: 'lena', name: '3C CAFE · Dialogue', id: 'scene-c', now: 1 }),
      takes: [{ id: 'k', promptId: 'k', imageUrl: '/k.png', at: 1 }],
      keptTakeId: 'k',
    };
    const planned = (shot: 'head' | 'waist' | 'full', companions = false) => ({
      ...base,
      slot: { ...base.slot, poseCamera: { shot } },
      ...(companions ? { allowCompanions: true } : {}),
    });
    assert.equal(sceneStillFraming(planned('head')).framing, 'close');
    assert.equal(sceneStillFraming(planned('waist')).framing, 'medium');
    assert.equal(sceneStillFraming(planned('full')).framing, undefined);
    assert.equal(sceneStillFraming(planned('head', true)).framing, undefined);
    const [shot] = sceneCutShots([planned('head')], 'lena');
    assert.equal(shot!.framing, 'close');
    // "As shot" in Cut wins over the Scene's framing; a picked framing still applies.
    const keyed = { ...shot!, key: 'scenes:scene-c' };
    assert.equal(applyCutShotEdits([keyed], { shots: { 'scenes:scene-c': { framing: 'full' } } })[0]!.framing, undefined);
    assert.equal(applyCutShotEdits([keyed], { shots: { 'scenes:scene-c': { framing: 'medium' } } })[0]!.framing, 'medium');
    assert.equal(applyCutShotEdits([keyed], {})[0]!.framing, 'close');
  });
});
