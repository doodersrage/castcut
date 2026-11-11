import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import { scriptNotes } from './script-notes';
import { createScript, normalizeSavedScript, seriesSoFar } from './scene-scripts';
import {
  episodeFountain,
  EPISODE_EXAMPLE_SCENE,
  EPISODE_EXAMPLE_SCENES,
  episodeExampleFor,
  episodeOutlineMessages,
  episodeOutlineTokens,
  episodeSceneCount,
  episodeSceneMessages,
  episodeStoryNoteMessages,
  episodeStorySoFar,
  splitLongLines,
  episodeSceneTail,
  normalizeEpisodeHeading,
  parseEpisodeOutline,
  parseEpisodeScene,
  dayShortMoodAvailable,
  dayShortSeed,
  episodeLengthScenes,
  episodeWriteHref,
  nextEpisodeSeed,
  normalizeEpisodeScenes,
  readEpisodeWriteSeed,
} from './episode-writer';

const outline = {
  title: 'The Letter',
  logline: 'Mara finds a letter that changes her week.',
  scenes: [
    { heading: 'INT. KITCHEN - MORNING', summary: 'Mara finds the letter.', who: ['Mara'] },
    { heading: 'EXT. STREET - DAY', summary: 'She runs to the post office.', who: ['Mara', 'Lena'] },
  ],
};

describe('writing an episode (Part 19 G3)', () => {
  it('asks for a scene count that fits the length, with the cast named', () => {
    // ~45 s a scene as cut (the 2026-11-06 episode: 24 scenes came to ~18 minutes).
    assert.equal(episodeSceneCount(30), 40);
    assert.equal(episodeSceneCount(15), 20);
    assert.equal(episodeSceneCount(1), 4);
    assert.equal(episodeSceneCount(500), 40);
    const messages = episodeOutlineMessages({
      premise: 'A letter arrives.',
      lead: 'Mara',
      cast: [{ name: 'Mara', sex: 'woman' }, { name: 'Lena' }],
      minutes: 30,
    });
    assert.match(messages[1]!.content, /Mara \(a woman\), Lena/);
    assert.match(messages[1]!.content, /exactly 40 scenes/);
  });

  it('reads an outline, its headings made screenplay headings', () => {
    const parsed = parseEpisodeOutline(
      'Sure!\n```json\n{"title":"The Letter","logline":"x","scenes":[' +
        '{"heading":"1. Kitchen — morning","summary":"She reads it.","who":["Mara"]},' +
        '{"heading":"EXT. STREET","summary":"She runs.","who":[]},' +
        '{"heading":"","summary":"dropped"}]}\n```'
    );
    assert.deepEqual(
      parsed?.scenes.map(scene => scene.heading),
      ['INT. KITCHEN - MORNING', 'EXT. STREET - DAY']
    );
    assert.equal(parseEpisodeOutline('no json'), null);
    // Cut off by the token limit mid-scene (a half hour's 40 ran past 3,000): the whole scenes stay.
    const cut = parseEpisodeOutline(
      '{"title":"T","logline":"x","scenes":[' +
        '{"heading":"INT. KITCHEN - DAY","summary":"One.","who":["Mara"]},' +
        '{"heading":"EXT. STREET - DAY","summary":"Two.","who":[]},' +
        '{"heading":"INT. CAFE - NIGHT","summary":"Thr'
    );
    assert.deepEqual(
      cut?.scenes.map(scene => scene.summary),
      ['One.', 'Two.']
    );
    assert.equal(episodeOutlineTokens(40), 5000);
    assert.ok(episodeOutlineTokens(episodeSceneCount(30)) > 3000);
    assert.equal(normalizeEpisodeHeading('int. cafe - night'), 'INT. CAFE - NIGHT');
  });

  it('cleans a written scene and joins the scenes into a script the reader takes', () => {
    const one = parseEpisodeScene(
      'Here is the scene:\n```\n**INT. KITCHEN - MORNING**\n\nMara opens the envelope.\n\nMARA\nWho sent this?\n\nINT. HALL - DAY\n\nTOO FAR\n```',
      'INT. KITCHEN - MORNING'
    )!;
    assert.match(one, /^INT\. KITCHEN - MORNING\n\nMara opens the envelope\.\n\nMARA\nWho sent this\?\n$/);
    const two = parseEpisodeScene('She runs past the bakery.\n\nLENA\nMara, wait!', 'EXT. STREET - DAY')!;
    assert.match(two, /^EXT\. STREET - DAY\n/);
    assert.equal(parseEpisodeScene('', 'EXT. STREET - DAY'), null);
    const script = parseScript(episodeFountain(outline, [one, two]));
    assert.equal(script.scenes.length, 2);
    assert.deepEqual(script.scenes.map(scene => scene.speakers), [['MARA'], ['LENA']]);
    assert.equal(episodeSceneTail(one, 2), 'MARA\nWho sent this?');
  });

  it('gives each scene the outline and how the one before ended', () => {
    const messages = episodeSceneMessages({ outline, index: 1, lead: 'Mara', cast: [], before: 'MARA\nWho sent this?' });
    assert.match(messages.at(-1)!.content, /Write scene 2: EXT\. STREET - DAY — She runs/);
    assert.match(messages.at(-1)!.content, /How the scene before ended:\nMARA/);
  });

  it('says who is in the scene is there in person (no voice-over for them)', () => {
    const withHim = { ...outline, scenes: outline.scenes.map(scene => ({ ...scene, who: ['her partner'] })) };
    const messages = episodeSceneMessages({ outline: withHim, index: 0, lead: 'Mara', cast: [] });
    assert.match(messages.at(-1)!.content, /\(with her partner — there in person, seen: no \(V\.O\.\) for them\)/);
  });
});

describe('a short from Day', () => {
  it('counts a short in scenes, 2 to 40, over the minutes', () => {
    assert.equal(normalizeEpisodeScenes(undefined), null);
    assert.equal(normalizeEpisodeScenes('abc'), null);
    assert.equal(normalizeEpisodeScenes(1), 2);
    assert.equal(normalizeEpisodeScenes(12), 12);
    assert.equal(normalizeEpisodeScenes(99), 40);
    assert.equal(episodeLengthScenes({ minutes: 30, scenes: 5 }), 5);
    assert.equal(episodeLengthScenes({ minutes: 30 }), 40);
    const messages = episodeOutlineMessages({ premise: 'A rainy Saturday', lead: 'Mara', cast: [], minutes: 30, scenes: 5 });
    assert.match(messages.at(-1)!.content, /a short — write exactly 5 scenes, about 4 minutes on screen/);
  });

  it('carries the idea, its mood and its moments to the Scene page, and back', () => {
    const seed = dayShortSeed({ premise: '  A rainy Saturday  ', mood: 'everyday', moments: 6 });
    assert.deepEqual(seed, {
      premise: 'A rainy Saturday',
      tone: 'everyday slice of life, warm and observant',
      scenes: 6,
      mood: 'everyday',
    });
    const href = episodeWriteHref('cast-1', seed);
    assert.match(href, /^\/script\?character=cast-1&write=short&/);
    assert.deepEqual(readEpisodeWriteSeed(href.slice(href.indexOf('?'))), seed);
    // A mood with no tone of its own, and a URL with no idea, or no short asked for.
    assert.match(dayShortSeed({ premise: 'x', mood: 'sport', moments: 4 }).tone ?? '', /sport/);
    assert.equal(dayShortSeed({ premise: 'x', mood: 'sport', moments: 4 }).mood, 'sport');
    // Intimate stays on Short's own board: no mood carried to the writer.
    assert.equal(dayShortSeed({ premise: 'x', mood: 'intimate', moments: 4 }).mood, undefined);
    assert.equal(dayShortMoodAvailable('intimate'), false);
    assert.equal(readEpisodeWriteSeed('?write=short&premise=x&scenes=3&mood=intimate')?.mood, undefined);
    assert.equal(readEpisodeWriteSeed('?write=short&scenes=4'), null);
    assert.equal(readEpisodeWriteSeed('?premise=x&scenes=4'), null);
  });
});

describe('adult writing', () => {
  it('asks for adults only — over 21, consenting — and only when asked', () => {
    const plain = episodeOutlineMessages({ premise: 'x', lead: 'Mara', cast: [], minutes: 10 });
    assert.doesNotMatch(plain[0]!.content, /adult fiction/);
    const adult = episodeOutlineMessages({ premise: 'x', lead: 'Mara', cast: [], minutes: 10, adult: true });
    assert.match(adult[0]!.content, /every character is an adult over 21/i);
    assert.match(adult[0]!.content, /never a school, a classroom, a teenager or a child/);
    assert.match(adult[0]!.content, /consenting adults: nothing non-consensual/);
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. ROOM - NIGHT', summary: 's', who: [] }, { heading: 'INT. ROOM - DAY', summary: 's', who: [] }] };
    assert.match(episodeSceneMessages({ outline, index: 0, lead: 'Mara', cast: [], adult: true })[0]!.content, /over 21/);
    assert.doesNotMatch(episodeSceneMessages({ outline, index: 0, lead: 'Mara', cast: [] })[0]!.content, /over 21/);
  });

  it('carries Intimate to the writer only with adult writing allowed', () => {
    assert.equal(dayShortSeed({ premise: 'x', mood: 'intimate', moments: 4, adult: true }).mood, 'intimate');
    assert.match(dayShortSeed({ premise: 'x', mood: 'intimate', moments: 4, adult: true }).tone ?? '', /consenting adults/);
    assert.equal(dayShortMoodAvailable('intimate', { adult: true }), true);
    assert.equal(readEpisodeWriteSeed('?write=short&premise=x&scenes=3&mood=intimate', { adult: true })?.mood, 'intimate');
  });
});

describe('the next one', () => {
  it('follows the script: how it ended, as many scenes, its mood', () => {
    const parsed = parseScript(
      'Title: Her Day\n\nINT. KITCHEN - MORNING\n\nShe pours coffee.\n\nEXT. PIER - NIGHT\n\nShe looks at the sea.\n\nMARA\nTomorrow, then.\n'
    );
    const seed = nextEpisodeSeed({ name: 'Her Day', mood: 'vacation', scenes: parsed.scenes });
    assert.match(seed.premise, /^The next episode after “Her Day”\./);
    assert.match(seed.premise, /How it ended:\nEXT\. PIER - NIGHT\nShe looks at the sea\.\nMARA: Tomorrow, then\./);
    assert.match(seed.premise, /What happens next: $/);
    assert.equal(seed.scenes, 2);
    assert.equal(seed.mood, 'vacation');
  });
});

describe('the writer’s craft (2026-11-08)', () => {
  it('asks the outline for wants, turns, planted details and a shape for its length', () => {
    const base = { premise: 'x', lead: 'Lena', cast: [] as never, minutes: 10 };
    const short = episodeOutlineMessages({ ...base, scenes: 6 })[0]!.content;
    const episode = episodeOutlineMessages(base)[0]!.content;
    for (const text of [short, episode]) {
      assert.match(text, /what she wants and what stands in her way/);
      assert.match(text, /every scene turns something/);
      assert.match(text, /pay off near the end/);
      assert.match(text, /at most two people seen together/);
    }
    assert.match(short, /set-up, a complication, a turn, a resolution/);
    assert.match(episode, /three acts/);
  });

  it('asks each scene to start late, end on a turn, keep lines short and be filmable', () => {
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. CAFE - DAY', summary: 's', who: [] }] };
    const text = episodeSceneMessages({ outline, index: 0, lead: 'Lena', cast: [] as never })[0]!.content;
    assert.match(text, /Come in late and leave early/);
    assert.match(text, /under fifteen words a line/);
    assert.match(text, /\(V\.O\.\) after their name/);
    assert.match(text, /no camera directions/);
  });
});

describe('a scene’s length (2026-11-10)', () => {
  it('asks for a page counted as it is filmed: sixteen elements at most', () => {
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. FLAT - DAY', summary: 'S', who: [] }] };
    const [system] = episodeSceneMessages({ outline, index: 0, lead: 'Lena', cast: [] });
    assert.match(system!.content, /at most sixteen elements in all, counting each action paragraph and each spoken line/);
  });
});

describe('names in the lines (2026-11-10)', () => {
  it('asks for no line opening on a name, and a name once a scene at most', () => {
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. FLAT - DAY', summary: 'S', who: [] }] };
    const [system] = episodeSceneMessages({ outline, index: 0, lead: 'Lena', cast: [] });
    assert.match(system!.content, /never open a line with the other person’s name, and use a name once in a scene at most/);
  });
});

describe('worked examples (2026-11-10)', () => {
  it('shows the scene example for its tone, the quiet one by default', () => {
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. FLAT - DAY', summary: 'S', who: [] }] };
    const example = (tone?: string) =>
      episodeSceneMessages({ outline, index: 0, lead: 'Lena', cast: [], tone })[2]!.content;
    assert.match(example('light comedy'), /Priya/);
    assert.match(example('flirty and playful, glamorous, always clothed'), /Priya/);
    assert.match(example('romance'), /Nadia/);
    assert.match(example('intimate and sensual, between consenting adults'), /Nadia/);
    assert.match(example('a tense mystery'), /Joss/);
    assert.match(example('everyday slice of life, warm and observant'), /Mara/);
    assert.match(example('sporty and driven: training, the match, the team, in the right kit'), /Mara/);
    assert.match(example(undefined), /Mara/);
    assert.match(example('melancholy'), /Mara/);
    assert.equal(episodeExampleFor('nothing matches'), EPISODE_EXAMPLE_SCENE);
  });

  it('keeps every rule in its own examples: no script note fires on them', () => {
    for (const { key, example } of EPISODE_EXAMPLE_SCENES) {
      const scene = parseScript(example[1]).scenes[0]!;
      assert.deepEqual(scriptNotes({ scriptId: key, scene }).map(note => note.rule), [], key);
    }
  });

  it('shows a short’s outline worked through, not an episode’s', () => {
    const short = episodeOutlineMessages({ premise: 'P', lead: 'Lena', cast: [], minutes: 2, scenes: 4 });
    assert.equal(short.length, 4);
    assert.match(short[1]!.content, /write exactly 3 scenes/);
    const outline = parseEpisodeOutline(short[2]!.content);
    assert.equal(outline?.scenes.length, 3);
    assert.match(short[3]!.content, /write exactly 4 scenes/);
    assert.equal(episodeOutlineMessages({ premise: 'P', lead: 'Lena', cast: [], minutes: 30 }).length, 2);
  });
});

describe('the writer knows the Cast and the places', () => {
  it('says who each is, and the places the film already has', () => {
    const cast = [{ name: 'Rob', sex: 'man', about: 'bald, in his forties; her best friend' }];
    const [, user] = episodeOutlineMessages({
      premise: 'x',
      lead: 'Lena',
      cast,
      minutes: 10,
      places: ['Salt & Sea Café', 'Beach', 'Beach'],
    });
    assert.match(user!.content, /Rob \(a man — bald, in his forties; her best friend\)/);
    assert.match(user!.content, /Places the film already has.*: Salt & Sea Café, Beach\./);
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. CAFE - DAY', summary: 's', who: [] }] };
    const scene = episodeSceneMessages({ outline, index: 0, lead: "Lena", cast }).at(-1);
    assert.match(scene!.content, /her best friend/);
  });
});

describe('long lines', () => {
  it('splits a long line of several sentences in two, the same speaker; leaves the rest', () => {
    const scene = [
      'INT. CAFE - DAY',
      '',
      'Lena wipes the counter.',
      '',
      'LENA',
      '(dry)',
      'I came here to sell it. Then I saw the view from the back step at sunset. Now I cannot stop thinking about the people who sat there.',
      '',
      'ROB',
      'Short one.',
      '',
      'ROB',
      'This is one very long sentence that keeps on going without ever stopping for breath at all today.',
    ].join('\n');
    const out = splitLongLines(scene);
    const parsed = parseScript(out).scenes[0]!;
    const said = parsed.elements.filter(el => el.kind === 'dialogue').map(el => el.text);
    assert.deepEqual(said, [
      'I came here to sell it. Then I saw the view from the back step at sunset.',
      'Now I cannot stop thinking about the people who sat there.',
      'Short one.',
      'This is one very long sentence that keeps on going without ever stopping for breath at all today.',
    ]);
    assert.match(out, /LENA\n\(dry\)\nI came here/);
    assert.equal(splitLongLines('INT. CAFE - DAY\n\nShe sits.'), 'INT. CAFE - DAY\n\nShe sits.');
  });
});

describe('the story so far', () => {
  it('keeps the latest notes within its length, in order', () => {
    assert.equal(episodeStorySoFar(['She inherits the café.', '', 'Rob  owns the van.']), 'She inherits the café.\nRob owns the van.');
    const long = Array.from({ length: 50 }, (_, i) => `Note ${i} ${'x'.repeat(40)}.`);
    const kept = episodeStorySoFar(long, 200);
    assert.ok(kept.length <= 200);
    assert.match(kept, /Note 49/);
    assert.doesNotMatch(kept, /Note 0 /);
  });

  it('is given to each scene, and asked of each written scene', () => {
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. CAFE - DAY', summary: 's', who: [] }] };
    const scene = episodeSceneMessages({ outline, index: 0, lead: 'Lena', cast: [], story: 'She inherits the café.' }).at(-1)!;
    assert.match(scene.content, /The story so far — keep it true:\nShe inherits the café\./);
    const [system, user] = episodeStoryNoteMessages({ scene: 'INT. CAFE - DAY\n\nShe signs.', story: 'Earlier.' });
    assert.match(system!.content, /what the next scenes must keep true/);
    assert.match(user!.content, /Already true:\nEarlier\./);
  });

  it('introduces newcomers by how they look and wear; never dresses the cast', () => {
    const outline = { title: 'T', logline: 'L', scenes: [{ heading: 'INT. CAFE - DAY', summary: 's', who: [] }] };
    const system = episodeSceneMessages({ outline, index: 0, lead: 'Lena', cast: [] })[0]!.content;
    assert.match(system, /not in the cast list is introduced the first time they appear/);
    assert.match(system, /never describe their clothes/);
  });
});

describe('a series', () => {
  it('reads the episodes a script follows on from, and keeps the summary with a script', () => {
    const scripts = [
      { id: 'e1', name: 'One', summary: 'She inherits the café.' },
      { id: 'e2', name: 'Two', summary: 'Rob fixes the grinder.', follows: 'e1' },
      { id: 'e3', name: 'Three', follows: 'e2' },
    ];
    assert.equal(
      seriesSoFar(scripts[2]!, scripts),
      '“One”: She inherits the café.\n“Two”: Rob fixes the grinder.\n“Three”'
    );
    const kept = normalizeSavedScript({ ...createScript({ castId: 'c', source: 'INT. A - DAY\n\nx.', summary: 'S.', follows: 'e2' })! });
    assert.deepEqual([kept?.summary, kept?.follows], ['S.', 'e2']);
  });

  it('is what the next episode is written knowing', () => {
    const seed = nextEpisodeSeed({ id: 'e3', name: 'Three', series: '“One”: x', scenes: [] });
    assert.deepEqual([seed.follows, seed.series], ['e3', '“One”: x']);
    const [, user] = episodeOutlineMessages({ premise: 'p', lead: 'Lena', cast: [], minutes: 10, series: '“One”: x' });
    assert.match(user!.content, /The series so far — this episode follows on, keeping it true:\n“One”: x/);
  });
});
