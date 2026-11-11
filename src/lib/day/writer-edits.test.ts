import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { episodeSceneMessages } from './episode-writer';
import {
  WRITER_EDITS_MAX,
  normalizeWriterEdits,
  withWriterEdits,
  writerEditFor,
  writerEditsBetween,
} from './writer-edits';

const WRITTEN = [
  'INT. BAKERY - MORNING',
  '',
  'Lena pushes a tray into the oven.',
  '',
  'ROB',
  'I am so sorry about everything that happened with the letter yesterday.',
  '',
  'EXT. HARBOUR - NIGHT',
  '',
  'Rob holds out the key.',
  '',
  'LENA',
  'Keep it.',
].join('\n');

describe('the writer learns from your edits', () => {
  it('keeps the scenes you rewrote, as written and as kept; not a typo, not the others', () => {
    const kept = WRITTEN.replace(
      'I am so sorry about everything that happened with the letter yesterday.',
      'The letter. I read it.'
    ).replace('Keep it.', 'Keep it!');
    const edits = writerEditsBetween({ written: WRITTEN, kept, tone: 'tense', now: 5 });
    assert.equal(edits.length, 1);
    assert.match(edits[0]!.written, /^INT\. BAKERY - MORNING[\s\S]*so sorry about everything/);
    assert.doesNotMatch(edits[0]!.written, /HARBOUR/);
    assert.match(edits[0]!.kept, /The letter\. I read it\./);
    assert.deepEqual([edits[0]!.tone, edits[0]!.at], ['tense', 5]);
  });

  it('pairs by heading; a scene dropped or added is no edit', () => {
    const dropped = WRITTEN.split('\nEXT.')[0]!;
    assert.deepEqual(writerEditsBetween({ written: WRITTEN, kept: dropped }), []);
    const renamed = WRITTEN.replace('EXT. HARBOUR - NIGHT', 'EXT. PIER - NIGHT');
    assert.deepEqual(writerEditsBetween({ written: WRITTEN, kept: renamed }), []);
  });

  it('keeps the newest few, reads old or broken saves, and picks one in its tone', () => {
    assert.deepEqual(normalizeWriterEdits(undefined), []);
    assert.deepEqual(normalizeWriterEdits([null, { written: 'a', kept: 'a', at: 1 }, { written: 'a' }]), []);
    const many = Array.from({ length: 6 }, (_, at) => ({ written: `w${at}`, kept: `k${at}`, at, ...(at === 1 ? { tone: 'Comedy' } : {}) }));
    const list = withWriterEdits([], many);
    assert.equal(list.length, WRITER_EDITS_MAX);
    assert.deepEqual(list.map(edit => edit.at), [5, 4, 3, 2]);
    assert.equal(writerEditFor(withWriterEdits(list, [{ written: 'x', kept: 'y', tone: 'comedy', at: 9 }]), 'COMEDY')?.kept, 'y');
    assert.equal(writerEditFor(list, 'comedy')?.at, 5);
    assert.equal(writerEditFor([], 'comedy'), undefined);
  });

  it('is shown to the scene writer, as written and as you rewrote it', () => {
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. FLAT - DAY', summary: 'S', who: [] }] };
    const user = (yourEdit?: { written: string; kept: string }) =>
      episodeSceneMessages({ outline, index: 0, lead: 'Lena', cast: [], yourEdit }).at(-1)!.content;
    assert.match(user({ written: 'OLD LINES', kept: 'NEW LINES' }), /rewrote one of your scenes[\s\S]*As you wrote it:\nOLD LINES\n\nAs they rewrote it:\nNEW LINES/);
    assert.doesNotMatch(user(), /rewrote/);
  });
});
