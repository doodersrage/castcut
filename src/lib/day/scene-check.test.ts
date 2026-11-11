import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { episodeCritiqueMessages, parseEpisodeCritique } from './episode-writer';
import { betterScene, checkWrittenScene, type SceneCheckPost } from './scene-check';

const scene = (lines: string[]) => lines.join('\n');

const NOSY = scene([
  'INT. BAKERY - MORNING',
  '',
  'Lena pushes a tray into the oven.',
  '',
  'ROB',
  'I’m so angry about the letter.',
  '',
  'LENA',
  'It was empty.',
  '',
  'Rob holds out the key.',
]);
const FIXED = NOSY.replace('I’m so angry about the letter.', 'You kept the letter.');
const CLEAN = FIXED;

/** A fake /api/script-episode: what each step returns, and every body it was sent. */
function fake(replies: Record<string, unknown>) {
  const sent: Record<string, unknown>[] = [];
  const post: SceneCheckPost = async <T,>(body: Record<string, unknown>) => {
    sent.push(body);
    const reply = replies[body.step as string];
    if (reply instanceof Error) throw reply;
    return reply as T;
  };
  return { post, sent };
}

describe('the editor’s read', () => {
  it('asks for three notes at most, quoting what they are about, or NONE', () => {
    const [system, user] = episodeCritiqueMessages({ scene: CLEAN, summary: 'He gives the key back', lead: 'Lena', cast: [] });
    assert.match(system!.content, /at most three notes/);
    assert.match(system!.content, /NONE/);
    assert.match(user!.content, /What the scene is meant to do: He gives the key back/);
    assert.match(user!.content, /The scene:\nINT\. BAKERY/);
  });

  it('reads its notes: bullets or numbers, NONE as none, chatter dropped', () => {
    assert.deepEqual(parseEpisodeCritique('NONE'), []);
    assert.deepEqual(parseEpisodeCritique('None.'), []);
    assert.deepEqual(parseEpisodeCritique(''), []);
    assert.deepEqual(
      parseEpisodeCritique(
        '<think>hmm</think>Here are my notes:\n- “I’m so angry” says it outright: show it.\n2. The ending is a goodbye — end on the key.\n* ok\n- a\n- four: too many notes here\n- five'
      ),
      ['“I’m so angry” says it outright: show it.', 'The ending is a goodbye — end on the key.', 'four: too many notes here']
    );
  });
});

describe('a written scene checked before it is kept', () => {
  it('revises for the rule’s notes and keeps a revision with fewer', async () => {
    const { post, sent } = fake({ revise: { text: FIXED } });
    const out = await checkWrittenScene({ text: NOSY, post, check: true, edit: false });
    assert.equal(out.text, FIXED);
    assert.equal(out.revised, true);
    assert.deepEqual(sent.map(body => body.step), ['revise']);
    assert.match(String((sent[0]!.notes as string[])[0]), /feeling outright/);
  });

  it('leaves a clean scene alone without the editor; with it, revises for its notes', async () => {
    const quiet = fake({});
    assert.equal((await checkWrittenScene({ text: CLEAN, post: quiet.post, check: true, edit: false })).revised, false);
    assert.equal(quiet.sent.length, 0);

    const better = CLEAN.replace('It was empty.', 'Empty. Like your promises.');
    const edited = fake({ critique: { notes: ['“It was empty” is flat: give it an edge.'] }, revise: { text: better } });
    const out = await checkWrittenScene({ text: CLEAN, post: edited.post, check: true, edit: true, summary: 'S' });
    assert.equal(out.text, better);
    assert.deepEqual(edited.sent.map(body => [body.step, body.summary]), [['critique', 'S'], ['revise', undefined]]);
  });

  it('keeps the scene when the editor has nothing, or a revision is worse or not the scene', async () => {
    const none = fake({ critique: { notes: [] } });
    assert.equal((await checkWrittenScene({ text: CLEAN, post: none.post, check: true, edit: true })).revised, false);
    assert.deepEqual(none.sent.map(body => body.step), ['critique']);

    const worse = fake({ critique: { notes: ['x is flat'] }, revise: { text: NOSY } });
    assert.equal((await checkWrittenScene({ text: CLEAN, post: worse.post, check: true, edit: true })).text, CLEAN);

    const gutted = fake({ critique: { notes: ['x is flat'] }, revise: { text: 'INT. BAKERY - MORNING\n\nLena waits.' } });
    assert.equal((await checkWrittenScene({ text: CLEAN, post: gutted.post, check: true, edit: true })).text, CLEAN);

    const failing = fake({ critique: new Error('busy'), revise: new Error('busy') });
    assert.equal((await checkWrittenScene({ text: NOSY, post: failing.post, check: true, edit: true })).text, NOSY);
  });
});

describe('best of two', () => {
  it('keeps the draft with fewer notes, then the one nearer a page, then the first', () => {
    assert.equal(betterScene([NOSY, CLEAN]), CLEAN);
    assert.equal(betterScene([CLEAN, NOSY]), CLEAN);
    const page = ['INT. BAKERY - MORNING', '', ...Array.from({ length: 6 }, (_, n) => [`Lena pushes tray ${n} in.`, '', 'ROB', `Tray ${n}.`, '']).flat()].join('\n');
    assert.equal(betterScene([CLEAN, page]), page);
    assert.equal(betterScene([CLEAN, CLEAN.replace('It was empty.', 'Empty.')]), CLEAN);
    assert.equal(betterScene(['', CLEAN]), CLEAN);
    // A line said in an earlier scene counts against it.
    const fresh = CLEAN.replace('You kept the letter.', 'The letter stays with me.').replace('It was empty.', 'Empty.');
    assert.equal(betterScene([CLEAN, fresh], [CLEAN]), fresh);
  });
});
