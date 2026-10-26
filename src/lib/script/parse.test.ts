import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from './parse';

const SCRIPT = `Title: The Rooftop
Author: Rae Ortiz
Draft date: 26 Oct

# ACT ONE

= Nora meets Tomas.

FADE IN:

INT. KITCHEN - MORNING

Nora pours coffee. She checks her *phone*.
Rain on the window.

NORA
Coffee first.

TOMAS (O.S.)
(calling)
Are you up?
I made toast.

[[Cut the toast line?]]

CUT TO:

EXT. ROOFTOP - NIGHT #12#

> THE CITY <

!LIGHTS FLICKER.

NORA ^
Look.

~Fly me to the moon

/* an older take on this scene
NORA
It was never this quiet. */

===

.FLASHBACK - A BEACH

Waves.

INT. KITCHEN - MORNING

Empty cups.
`;

describe('screenplay parser (M3 S1)', () => {
  it('reads the title page, sections, synopses and every scene element with its lines', () => {
    const script = parseScript(SCRIPT);
    assert.equal(script.format, 'fountain');
    assert.deepEqual(script.title, {
      title: 'The Rooftop',
      author: 'Rae Ortiz',
      'draft date': '26 Oct',
    });
    assert.deepEqual(
      script.preamble.map(e => [e.kind, e.text]),
      [
        ['section', 'ACT ONE'],
        ['synopsis', 'Nora meets Tomas.'],
        ['transition', 'FADE IN:'],
      ]
    );
    assert.equal(script.preamble[0]!.depth, 1);

    const [kitchen, roof, beach, again] = script.scenes;
    assert.deepEqual(
      [kitchen!.setting, kitchen!.place, kitchen!.time, kitchen!.dayPart],
      ['INT', 'KITCHEN', 'MORNING', 'morning']
    );
    assert.deepEqual(
      kitchen!.elements.map(e => e.kind),
      ['action', 'character', 'dialogue', 'character', 'parenthetical', 'dialogue', 'note', 'transition']
    );
    const action = kitchen!.elements[0]!;
    assert.equal(action.text, 'Nora pours coffee. She checks her *phone*.\nRain on the window.');
    assert.deepEqual([action.from, action.to], [13, 14]);
    const tomas = kitchen!.elements[3]!;
    assert.deepEqual([tomas.speaker, tomas.extension], ['TOMAS', 'O.S.']);
    assert.equal(kitchen!.elements[5]!.text, 'Are you up?\nI made toast.');
    assert.equal(kitchen!.elements[6]!.text, 'Cut the toast line?');
    assert.deepEqual(kitchen!.speakers, ['NORA', 'TOMAS']);

    assert.equal(roof!.id, 'scene-12');
    assert.deepEqual([roof!.number, roof!.setting, roof!.place, roof!.dayPart], ['12', 'EXT', 'ROOFTOP', 'night']);
    assert.deepEqual(
      roof!.elements.map(e => [e.kind, e.text]),
      [
        ['centered', 'THE CITY'],
        ['action', 'LIGHTS FLICKER.'],
        ['character', 'NORA ^'],
        ['dialogue', 'Look.'],
        ['lyric', 'Fly me to the moon'],
        ['page-break', '==='],
      ]
    );
    assert.equal(roof!.elements[2]!.dual, true);
    // The boneyard's text isn't read as part of the scene.
    assert.ok(!roof!.elements.some(e => /never this quiet/.test(e.text)));

    assert.deepEqual([beach!.heading, beach!.place, beach!.setting], ['FLASHBACK - A BEACH', 'FLASHBACK', undefined]);
    assert.equal(again!.place, 'KITCHEN');
    assert.equal(script.issues.length, 0);
  });

  it('gives stable scene ids: an edit elsewhere, or another scene before it, keeps them', () => {
    const ids = parseScript(SCRIPT).scenes.map(s => s.id);
    assert.deepEqual(ids, ['int-kitchen-morning', 'scene-12', 'flashback-a-beach', 'int-kitchen-morning-2']);
    const edited = parseScript(SCRIPT.replace('Nora pours coffee.', 'Nora pours tea.'));
    assert.deepEqual(edited.scenes.map(s => s.id), ids);
    const added = parseScript(SCRIPT.replace('EXT. ROOFTOP', 'INT. HALL - DAY\n\nShe runs.\n\nEXT. ROOFTOP'));
    assert.deepEqual(
      added.scenes.map(s => s.id),
      ['int-kitchen-morning', 'int-hall-day', 'scene-12', 'flashback-a-beach', 'int-kitchen-morning-2']
    );
  });

  it('reports what it cannot read instead of dropping it', () => {
    const unclosed = parseScript('INT. ROOM - DAY\n\nShe waits. [[a note that never ends\n\nNORA\nHi.');
    assert.match(unclosed.issues[0]!.reason, /never closed/);
    // It ends at the blank line: the rest of the script still reads.
    assert.deepEqual(
      unclosed.scenes[0]!.elements.map(e => e.kind),
      ['action', 'note', 'character', 'dialogue']
    );
    const comment = parseScript('INT. ROOM - DAY\n\n/* everything after this\n\nNORA\nHi.');
    assert.match(comment.issues[0]!.reason, /comment/);
    assert.equal(comment.scenes[0]!.elements.length, 0);
    const fdx = parseScript('<?xml version="1.0"?><FinalDraft>');
    assert.match(fdx.issues[0]!.reason, /Final Draft/);
    assert.deepEqual(fdx.scenes, []);
    assert.match(parseScript('{\\rtf1 ...').issues[0]!.reason, /RTF/);
  });

  it('reads text with no scene headings as an outline, one scene per paragraph or item', () => {
    const outline = parseScript('She wakes up late.\n\n- Runs for the bus\n- Misses it\n\nWalks instead,\nin the rain.');
    assert.equal(outline.format, 'outline');
    assert.deepEqual(
      outline.scenes.map(s => [s.id, s.elements[0]!.text]),
      [
        ['outline-1', 'She wakes up late.'],
        ['outline-2', 'Runs for the bus'],
        ['outline-3', 'Misses it'],
        ['outline-4', 'Walks instead, in the rain.'],
      ]
    );
  });

  it('keeps an all-caps line on its own as action, and Windows line ends', () => {
    const script = parseScript('INT. ROOM - DAY\r\n\r\nBANG!\r\n\r\nSilence.\r\n');
    assert.deepEqual(
      script.scenes[0]!.elements.map(e => [e.kind, e.text]),
      [
        ['action', 'BANG!'],
        ['action', 'Silence.'],
      ]
    );
  });
});
