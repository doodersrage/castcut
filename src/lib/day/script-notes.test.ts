import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseScript } from '../script/parse';
import { episodeReviseMessages } from './episode-writer';
import { scriptNotes } from './script-notes';

const sceneOf = (lines: string[]) => parseScript(lines.join('\n')).scenes[0]!;

describe('script notes', () => {
  it('flags what a still can’t hold: three on screen, long lines, a montage, a camera direction', () => {
    const scene = sceneOf([
      'INT. CAFE - DAY',
      '',
      'A montage of the café filling up. CLOSE ON the till.',
      '',
      'LENA',
      'This is the first full day we have had since my aunt left this place to me last spring, and I still cannot believe it.',
      '',
      'ROB',
      'Believe it.',
      '',
      'MAYA',
      'Me too.',
      '',
    ]);
    const notes = scriptNotes({ scriptId: 's1', scene });
    assert.deepEqual(
      notes.map(note => [note.rule, note.evidence]),
      [
        ['script-many', '3 people speak on screen here'],
        ['script-long-line', '1 line over 20 words'],
        ['script-unfilmable', '“montage” in the action'],
        ['script-camera', 'A camera direction (“CLOSE ON”)'],
      ]
    );
    assert.equal(notes[0]!.source, 'Script notes');
  });

  it('counts a voice heard, not seen, off the screen; flags lines with nothing seen', () => {
    const scene = sceneOf(['INT. FLAT - NIGHT', '', 'LENA', 'Hello?', '', 'ROB (V.O.)', 'It’s me.', '', 'MAYA (O.S.)', 'Who is it?', '']);
    assert.deepEqual(
      scriptNotes({ scriptId: 's1', scene }).map(note => note.rule),
      ['script-no-action']
    );
  });

  it('asks the LLM to fix only what the notes say', () => {
    const [system, user] = episodeReviseMessages({
      scene: 'INT. CAFE - DAY\n\nA montage.',
      notes: ['“montage” in the action — show it through them'],
      lead: 'Lena',
      cast: [],
    });
    assert.match(system!.content, /changing as little as you can/);
    assert.match(system!.content, /Where a note asks to cut, cut/);
    assert.match(user!.content, /- “montage” in the action/);
    assert.match(user!.content, /The scene:\nINT\. CAFE - DAY/);
  });

  it('flags action that is only atmosphere (the overnight episode’s pose misses), not action that acts', () => {
    const mood = sceneOf([
      'INT. SALT & SAVE CAFÉ - NIGHT',
      '',
      'The café glows warm under string lights. Salt air lingers in the air like a ghost’s sigh.',
      '',
      'ROB',
      'It wasn’t always like this.',
      '',
    ]);
    assert.deepEqual(scriptNotes({ scriptId: 's', scene: mood }).map(note => note.evidence), [
      'Its action is only atmosphere — no one is doing anything',
    ]);
    const acts = sceneOf(['INT. CAFE - NIGHT', '', 'The café glows. Lena wipes the counter.', '', 'ROB', 'Late.', '']);
    assert.deepEqual(scriptNotes({ scriptId: 's', scene: acts }), []);
  });
});


describe('looking counts when it acts', () => {
  it('“She looks around.” is someone doing something', () => {
    const scene = parseScript('INT. CAFE - DAY\n\nShe looks around.\n\nLENA\nHello?\n').scenes[0]!;
    assert.deepEqual(scriptNotes({ scriptId: 's', scene }), []);
  });

  it('flags craft slips: a feeling said outright, names said, an ending on a goodbye', () => {
    const scene = sceneOf([
      'INT. BAKERY - MORNING',
      '',
      'Lena pushes a tray into the oven.',
      '',
      'ROB',
      'Lena, I’m so angry about the letter.',
      '',
      'LENA',
      'Rob. Don’t.',
      '',
      'ROB',
      'Fine. Bye.',
      '',
    ]);
    const notes = scriptNotes({ scriptId: 's1', scene });
    assert.deepEqual(
      notes.map(note => [note.rule, note.evidence]),
      [
        ['script-on-the-nose', 'A line says the feeling outright (“Lena, I’m so angry about the letter.”)'],
        ['script-names', 'Names said in 2 lines'],
        ['script-weak-ending', 'It ends on a goodbye'],
      ]
    );
  });

  it('leaves a scene that talks around it and ends on a turn; flags a walk out', () => {
    const fine = sceneOf([
      'INT. BAKERY - MORNING',
      '',
      'Lena pushes a tray into the oven.',
      '',
      'ROB',
      'You kept the letter.',
      '',
      'LENA',
      'I kept the envelope. Rob, it was empty.',
      '',
      'Rob holds out the key.',
      '',
    ]);
    assert.deepEqual(scriptNotes({ scriptId: 's1', scene: fine }), []);
    const walks = sceneOf([
      'INT. BAKERY - MORNING',
      '',
      'Lena pushes a tray into the oven.',
      '',
      'ROB',
      'Keep it.',
      '',
      'Rob walks out.',
      '',
    ]);
    assert.deepEqual(
      scriptNotes({ scriptId: 's1', scene: walks }).map(note => note.evidence),
      ['It ends on someone leaving']
    );
  });

  it('flags a scene that runs long and a line said twice', () => {
    const long = sceneOf([
      'INT. BAKERY - MORNING',
      '',
      ...Array.from({ length: 13 }, (_, n) => [`Lena pushes tray ${n} into the oven.`, '', 'ROB', `Tray ${n}.`, '']).flat(),
    ]);
    assert.deepEqual(
      scriptNotes({ scriptId: 's1', scene: long }).map(note => [note.rule, note.evidence]),
      [['script-long-scene', 'It runs 26 beats']]
    );
    const loop = sceneOf([
      'INT. BAKERY - MORNING',
      '',
      'Lena pushes a tray into the oven.',
      '',
      'LENA',
      'It’s not funny anymore.',
      '',
      'ROB',
      'It was.',
      '',
      'LENA',
      '(quietly)',
      'It’s not funny anymore!',
      '',
      'Rob holds out the key.',
      '',
    ]);
    assert.deepEqual(
      scriptNotes({ scriptId: 's1', scene: loop }).map(note => [note.rule, note.evidence]),
      [['script-repeated-line', '“It’s not funny anymore.” is said 2 times']]
    );
  });

  it('flags a line said again in a later scene, and inner life told in the action', () => {
    const first = sceneOf(['INT. BAKERY - MORNING', '', 'Lena pushes a tray into the oven.', '', 'LENA', 'It’s not funny anymore.', '']);
    const later = sceneOf([
      'INT. FLAT - NIGHT',
      '',
      'Lena holds the letter. She wonders if he knew. She lets out a breath she didn’t know she held.',
      '',
      'LENA',
      'It’s not funny anymore!',
      '',
    ]);
    assert.deepEqual(
      scriptNotes({ scriptId: 's1', scene: later, earlier: [first] }).map(note => [note.rule, note.evidence]),
      [
        ['script-repeated-line', '“It’s not funny anymore!” was said in an earlier scene'],
        ['script-unseen', 'The action tells what can’t be seen (“she wonders”)'],
      ]
    );
    // One touch of inner life is a writer's licence; no earlier scene, no repeat.
    const once = sceneOf(['INT. FLAT - NIGHT', '', 'Lena holds the letter. She wonders if he knew.', '', 'LENA', 'It’s not funny anymore.', '']);
    assert.deepEqual(scriptNotes({ scriptId: 's1', scene: once }), []);
  });
});
