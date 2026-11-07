import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import {
  buildLineDeliveryMessages,
  normalizeDelivery,
  parseLineDelivery,
  scriptLineNote,
} from './line-delivery';
import { buildNarrationGraph } from './narration';

const scene = parseScript(
  [
    'INT. SALT & SEA CAFÉ - DAY',
    '',
    'Lena tugs at the stuck drawer.',
    '',
    'LENA',
    '(trying the handle)',
    'Come on… open up.',
    '',
    'ROB',
    'It was always locked. Until she left.',
    '',
    'LENA',
    '(voice tight)',
    'Then why didn’t you tell me?',
  ].join('\n')
).scenes[0]!;

describe('how a read line is said', () => {
  it('finds the note written above a line, by its words', () => {
    assert.equal(scriptLineNote(scene, 'Come on… open up.'), 'trying the handle');
    assert.equal(scriptLineNote(scene, 'Then why didn’t you tell me?'), 'voice tight');
    // A shot's line cut short still finds its dialogue.
    assert.equal(scriptLineNote(scene, 'Then why didn’t you'), 'voice tight');
    assert.equal(scriptLineNote(scene, 'It was always locked. Until she left.'), undefined);
    assert.equal(scriptLineNote(scene, 'Not in this scene.'), undefined);
  });

  it('keeps a delivery short and plain', () => {
    assert.equal(normalizeDelivery(' (Teasing, “a smile” in her voice). '), 'Teasing, a smile in her voice');
    assert.equal(normalizeDelivery(4), '');
    assert.equal(normalizeDelivery('x'.repeat(300)).length, 100);
  });

  it('asks the LLM with each line, its note and its moment, and reads only the ids asked', () => {
    const [system, user] = buildLineDeliveryMessages([
      { id: 'scenes:a', speaker: 'Lena', text: 'Come on… open up.', note: 'trying the handle', context: 'At the drawer.' },
    ]);
    assert.match(system!.content, /voice director/);
    assert.match(system!.content, /not everything soft or quiet/);
    assert.match(user!.content, /"note":"trying the handle"/);
    assert.match(user!.content, /"moment":"At the drawer."/);
    const reply =
      'Sure: {"deliveries":[{"id":"scenes:a","delivery":"straining, frustrated, under her breath."},{"id":"other","delivery":"loud"},{"id":"scenes:b","delivery":""}]}';
    assert.deepEqual(parseLineDelivery(reply, ['scenes:a', 'scenes:b']), {
      'scenes:a': 'straining, frustrated, under her breath',
    });
    assert.deepEqual(parseLineDelivery('no json', ['scenes:a']), {});
  });

  it('puts the delivery into LTX’s prompt too, a calm voice-over without one', () => {
    const text = (delivery?: string) =>
      String(
        buildNarrationGraph({ line: 'Hi.', speaker: 'woman', seed: 1, prefix: 'p', ...(delivery ? { delivery } : {}) })['5']!
          .inputs.text
      );
    assert.match(text('teasing, a smile in her voice'), /says a line, teasing, a smile in her voice/);
    assert.match(text(), /calm voice-over/);
  });
});

describe('a line said in a scene, not narrated', () => {
  it('is framed as acting, with its delivery or as natural conversation', async () => {
    const { sceneLineInstruct } = await import('./narration-server');
    assert.match(sceneLineInstruct('teasing'), /^An actor in a TV drama, .*not narrating.*: teasing$/);
    assert.match(sceneLineInstruct(undefined), /: natural and conversational$/);
  });

  it('holds its still for the line as read and a short pick-up', async () => {
    const { holdForSpokenLine } = await import('../story/film');
    const still = { key: 'a', title: 'A', url: '/a.png', kind: 'still' as const, holdSec: 3 };
    assert.deepEqual(holdForSpokenLine(still, 'Now.', 0.9), { ...still, holdSec: 1.5, holdFixed: true });
    assert.equal(holdForSpokenLine(still, 'A longer line.', 2.4).holdSec, 2.7);
    // Its length unknown: held as before, for the line's words.
    assert.ok((holdForSpokenLine(still, 'Now.', undefined).holdSec ?? 0) >= 3);
  });
});
