import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  absoluteUrl,
  callSheetHtml,
  escapeHtml,
  pressKitHtml,
  scriptFountain,
  scriptHtml,
  storyboardHtml,
} from './print-sheets';

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



  it('builds a press kit with poster, story, cast, stills and credits', () => {
    const html = pressKitHtml({
      title: 'Rae <home>',
      tagline: 'She came back.',
      poster: '/p.png',
      story: ['The letter', 'The train'],
      cast: ['Rae', 'Mia'],
      stills: ['/a.png', '', '/b.png'],
      credits: ['Starring', 'Rae'],
      origin: 'http://h',
    });
    assert.match(html, /Rae &lt;home&gt; — press kit/);
    assert.match(html, /<img class="poster" src="http:\/\/h\/p\.png"/);
    assert.match(html, /<li>The letter<\/li><li>The train<\/li>/);
    assert.match(html, /Rae · Mia/);
    assert.equal((html.match(/<section class="stills"><img/g) ?? []).length, 1);
    assert.equal((html.match(/src="http:\/\/h\/[ab]\.png"/g) ?? []).length, 2);
  });
});
