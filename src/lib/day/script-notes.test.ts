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
    assert.match(user!.content, /- “montage” in the action/);
    assert.match(user!.content, /The scene:\nINT\. CAFE - DAY/);
  });
});
