import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { draftShots } from './script-shots';
import { patchedMomentScene, replannedMomentShots } from './short-scene-edit';

const SOURCE = [
  'Title: Rooftop',
  '',
  'EXT. ROOFTOP - NIGHT',
  '',
  'Mara leans on the rail.',
  '',
  'Theo brings two cups.',
  '',
  'THEO',
  '(quietly)',
  'You came.',
  '',
  'MARA',
  'I said I would.',
  '',
  'THEO',
  'Cold?',
  '',
].join('\n');

const lines = SOURCE.split('\n');
const scene = parseScript(SOURCE).scenes[0]!;
const base = { leadSpeakers: ['MARA'], leadCue: 'MARA', lineBefore: 'I said I would.' };

describe('a scene moment edited on its card (Step 5b-ii)', () => {
  it('rewrites only the heading, the first action and the lead’s line', () => {
    const out = patchedMomentScene(lines, scene, {
      ...base,
      heading: 'EXT. ROOFTOP - EVENING',
      beat: 'Mara waits at the rail, coat buttoned.',
      line: 'I always do.',
    })!;
    const parsed = parseScript(out.join('\n'));
    const [again] = parsed.scenes;
    assert.equal(again!.heading, 'EXT. ROOFTOP - EVENING');
    const text = (kind: string) =>
      again!.elements.filter(element => element.kind === kind).map(element => element.text);
    assert.deepEqual(text('action'), ['Mara waits at the rail, coat buttoned.', 'Theo brings two cups.']);
    assert.deepEqual(text('dialogue'), ['You came.', 'I always do.', 'Cold?']);
    assert.deepEqual(text('parenthetical'), ['(quietly)']);
    assert.deepEqual(again!.speakers, ['THEO', 'MARA']);
  });

  it('takes the lead’s line away with its cue, and adds one the scene didn’t have', () => {
    const gone = patchedMomentScene(lines, scene, { ...base, heading: scene.heading, line: '' })!;
    const [without] = parseScript(gone.join('\n')).scenes;
    assert.deepEqual(
      without!.elements.filter(element => element.kind === 'dialogue').map(element => element.speaker),
      ['THEO', 'THEO']
    );
    assert.ok(!gone.includes('MARA'));
    // No double blank line where it was.
    assert.ok(!gone.some((text, index) => !text.trim() && index > 0 && !gone[index - 1]!.trim()));
    const quiet = parseScript('INT. KITCHEN - DAY\n\nShe waits.\n').scenes[0]!;
    const added = patchedMomentScene(['INT. KITCHEN - DAY', '', 'She waits.'], quiet, {
      ...base,
      lineBefore: undefined,
      heading: quiet.heading,
      line: 'Finally.',
    })!;
    const [said] = parseScript(added.join('\n')).scenes;
    assert.deepEqual(said!.speakers, ['MARA']);
  });

  it('leaves the scene as written when the card says what it says', () => {
    const same = patchedMomentScene(lines, scene, {
      ...base,
      heading: scene.heading,
      beat: 'Mara leans on the rail.',
      line: 'I said I would.',
    })!;
    assert.deepEqual(same, lines.slice(scene.from - 1, scene.to));
  });

  it('plans the shots again, each carrying its Scene by what it covers', () => {
    const before = draftShots(scene).map((shot, index) => ({ ...shot, madeSceneId: `s-${index}` }));
    // The lead's line rewritten, the time moved (a new scene id from its heading).
    const out = patchedMomentScene(lines, scene, {
      ...base,
      heading: 'EXT. ROOFTOP - EVENING',
      line: 'I always do.',
    })!;
    const moved = parseScript(out.join('\n')).scenes[0]!;
    assert.notEqual(moved.id, scene.id);
    const after = replannedMomentShots(before, moved, {
      speaker: 'MARA',
      from: 'I said I would.',
      to: 'I always do.',
    });
    assert.equal(after.length, before.length);
    // Every Scene still has its shot — the edited line's too — and all on the new scene.
    assert.deepEqual(
      after.map(shot => shot.madeSceneId),
      before.map(shot => shot.madeSceneId)
    );
    assert.ok(after.every(shot => shot.sceneId === moved.id));
    assert.equal(after.find(shot => shot.speaker === 'MARA')!.line, 'I always do.');
    assert.equal(new Set(after.map(shot => shot.id)).size, after.length);
  });

  it('drops a shot no longer planned from the plan, and gives a new one an id of its own', () => {
    const before = draftShots(scene).map((shot, index) => ({ ...shot, madeSceneId: `s-${index}` }));
    const gone = patchedMomentScene(lines, scene, { ...base, heading: scene.heading, line: '' })!;
    const fewer = parseScript(gone.join('\n')).scenes[0]!;
    const after = replannedMomentShots(before, fewer);
    assert.ok(!after.some(shot => shot.speaker === 'MARA' && shot.purpose === 'dialogue'));
    const kept = new Set(after.map(shot => shot.madeSceneId).filter(Boolean));
    const dropped = before.filter(shot => !kept.has(shot.madeSceneId));
    assert.ok(dropped.length >= 1);
    // A new shot never takes a dropped shot's id (its Scene still names it).
    const ids = new Set(after.map(shot => shot.id));
    assert.ok(dropped.every(shot => !ids.has(shot.id) || after.find(entry => entry.id === shot.id)!.madeSceneId === shot.madeSceneId));
    assert.equal(ids.size, after.length);
  });
});
