import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  absoluteUrl,
  callSheetHtml,
  escapeHtml,
  scriptFountain,
  scriptHtml,
  storyboardHtml,
} from './print-sheets';
import { dayCallSheetRows, dayStoryboardFrames } from '../day/day-sheets';
import { storyScriptBlocks, storyStoryboardFrames } from '../story/story-sheets';

describe('print sheets', () => {
  it('escapes text and makes picture urls absolute', () => {
    assert.equal(escapeHtml(`<b>"Tom" & 'Ana'</b>`), '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Ana&#39;&lt;/b&gt;');
    assert.equal(absoluteUrl('/api/x.png', 'http://h:1/'), 'http://h:1/api/x.png');
    assert.equal(absoluteUrl('data:image/png;base64,AA', 'http://h'), 'data:image/png;base64,AA');
    assert.equal(absoluteUrl('', 'http://h'), '');
  });

  it('builds a storyboard and a call sheet with nothing unescaped', () => {
    const board = storyboardHtml({
      title: 'Rae <day>',
      origin: 'http://h',
      frames: [{ number: '1', image: '/s.png', heading: 'Morning', notes: [['Beat', 'pours <coffee>'], ['Line', '']] }],
    });
    assert.match(board, /<img src="http:\/\/h\/s\.png"/);
    assert.match(board, /pours &lt;coffee&gt;/);
    assert.doesNotMatch(board, /<dt>Line<\/dt>/);
    assert.match(board, /Rae &lt;day&gt; — storyboard/);
    const sheet = callSheetHtml({
      title: 'Rae',
      facts: [['Cast', 'Rae'], ['Mood', undefined]],
      origin: 'http://h',
      rows: [{ number: '1', when: 'Morning', line: 'Hi', status: 'Still' }],
    });
    assert.match(sheet, /<b>Cast<\/b>Rae/);
    assert.doesNotMatch(sheet, /Mood/);
    assert.match(sheet, /“Hi”/);
  });

  it('writes a script as a page and as Fountain', () => {
    const blocks = [
      { kind: 'heading' as const, text: 'Int. Kitchen - Morning' },
      { kind: 'action' as const, text: 'Rae pours coffee.' },
      { kind: 'dialogue' as const, character: 'Rae', parenthetical: 'quietly', text: 'Morning.' },
      { kind: 'heading' as const, text: 'the beach' },
      { kind: 'transition' as const, text: 'Cut to' },
    ];
    const html = scriptHtml({ title: 'Rae', author: 'Me', blocks });
    assert.match(html, /<p class="heading">Int\. Kitchen - Morning<\/p>/);
    assert.match(html, /<div class="paren">\(quietly\)<\/div>/);
    const fountain = scriptFountain({ title: 'Rae', author: 'Me', blocks });
    assert.match(fountain, /^Title: Rae\nAuthor: Me\n/);
    assert.match(fountain, /\nINT\. KITCHEN - MORNING\n/);
    assert.match(fountain, /\n\.THE BEACH\n/);
    assert.match(fountain, /\nRAE\n\(quietly\)\nMorning\.\n/);
    assert.match(fountain, /\n> CUT TO\n/);
  });

  it('maps a Day to frames and call sheet rows', () => {
    const slots = [
      {
        id: 'morning',
        label: 'Morning',
        location: 'kitchen',
        sceneHints: 'pours coffee',
        line: 'Hi',
        poseCamera: { height: 'low' as const },
        state: { carries: [{ text: 'a mug' }], emotion: 'sleepy' },
        thirdCastId: 'tom',
        wardrobeId: 'kit-1',
      },
      { id: 'noon', label: 'Noon' },
    ];
    const stills = [{ slotId: 'morning', status: 'completed' as const, imageUrl: '/m.png', promptId: 'p' }];
    const input = {
      slots: slots as never,
      stills: stills as never,
      lead: 'Rae',
      castNames: { tom: 'Tom' },
      outfitName: (id: string) => `Outfit ${id}`,
    };
    const [first, second] = dayStoryboardFrames(input);
    assert.equal(first!.heading, 'Morning — kitchen');
    assert.equal(first!.image, '/m.png');
    assert.ok(first!.notes.some(([label, text]) => label === 'State' && text === 'carries a mug · sleepy'));
    assert.equal(second!.image, undefined);
    const [row, empty] = dayCallSheetRows(input);
    assert.equal(row!.cast, 'Rae, Tom');
    assert.equal(row!.outfit, 'Outfit kit-1');
    assert.equal(row!.status, 'Still');
    assert.equal(empty!.status, 'Not shot');
  });

  it('maps a Story to a screenplay and a storyboard', () => {
    const beats = [
      { id: 'a', at: 1, title: 'The train', blurb: 'She steps off into the rain.', narration: 'I came back.', line: 'Hello?', replyLine: 'You came.', imageUrl: '/a.png' },
      { id: 'b', at: 2, title: '', blurb: '' },
    ];
    const blocks = storyScriptBlocks(beats as never, { lead: 'Rae', partner: 'Tom' });
    assert.deepEqual(blocks.slice(0, 5), [
      { kind: 'heading', text: '1. The train' },
      { kind: 'action', text: 'She steps off into the rain.' },
      { kind: 'dialogue', character: 'Rae (V.O.)', text: 'I came back.' },
      { kind: 'dialogue', character: 'Rae', text: 'Hello?' },
      { kind: 'dialogue', character: 'Tom', text: 'You came.' },
    ]);
    assert.deepEqual(blocks.slice(-2), [
      { kind: 'heading', text: '2. Scene' },
      { kind: 'transition', text: 'Fade out.' },
    ]);
    const [frame] = storyStoryboardFrames(beats as never);
    assert.equal(frame!.heading, 'The train');
    assert.equal(frame!.image, '/a.png');
  });
});
