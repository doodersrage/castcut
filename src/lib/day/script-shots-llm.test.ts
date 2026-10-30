import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseScript } from '../script/parse';
import { buildShotDraftMessages, parseShotDraft } from './script-shots-llm';

const scene = parseScript(
  'INT. KITCHEN - MORNING\n\nNora pours coffee. A letter lies on the table.\n\nNORA\nYou opened it?\n\nSAM\nIt was addressed to me.\n'
).scenes[0]!;

describe('an LLM shot draft, held to the scene', () => {
  it('numbers the scene’s lines for the LLM to point at', () => {
    const [system, user] = buildShotDraftMessages(scene);
    assert.match(system!.content, /"line":1/);
    assert.match(user!.content, /LINE 1 — NORA: You opened it\?/);
    assert.match(user!.content, /LINE 2 — SAM: It was addressed to me\./);
    assert.match(user!.content, /People: NORA, SAM/);
  });

  it('keeps usable shots: the script’s own line, known people, lengths in range', () => {
    const reply = JSON.stringify({
      shots: [
        { purpose: 'establishing', framing: 'full', who: ['Nora', 'Sam'], action: 'The kitchen.', seconds: 3 },
        { purpose: 'insert', framing: 'head', who: [], action: 'The letter on the table.', seconds: 0.4 },
        { purpose: 'dialogue', framing: 'waist', who: [], line: 1, seconds: 1 },
        { purpose: 'dialogue', framing: 'head', who: ['Sam', 'Ghost'], line: 2, seconds: 40 },
        { purpose: 'reaction', framing: 'sideways', who: ['nora'], seconds: 2 },
        { purpose: 'dialogue', framing: 'head', line: 9 },
        { purpose: 'montage', framing: 'full' },
      ],
    });
    const shots = parseShotDraft(`<think>plan</think>${reply}`, scene)!;
    assert.deepEqual(
      shots.map(shot => [shot.id, shot.purpose, shot.framing, shot.who.join('+'), shot.seconds]),
      [
        [`${scene.id}~1`, 'establishing', 'full', 'NORA+SAM', 3],
        [`${scene.id}~2`, 'insert', 'head', '', 1],
        [`${scene.id}~3`, 'dialogue', 'waist', 'NORA', 2],
        [`${scene.id}~4`, 'dialogue', 'head', 'SAM', 12],
        [`${scene.id}~5`, 'reaction', 'waist', 'NORA', 2],
      ]
    );
    assert.equal(shots[2]!.line, 'You opened it?');
    assert.equal(shots[2]!.speaker, 'NORA');
  });

  it('is null when nothing usable came back', () => {
    assert.equal(parseShotDraft('no json here', scene), null);
    assert.equal(parseShotDraft('{"shots":[{"purpose":"montage"}]}', scene), null);
    assert.equal(parseShotDraft('{"shots":"lots"}', scene), null);
  });
});
