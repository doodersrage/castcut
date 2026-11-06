import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScript } from '../script/parse';
import {
  episodeFountain,
  episodeOutlineMessages,
  episodeSceneCount,
  episodeSceneMessages,
  episodeSceneTail,
  normalizeEpisodeHeading,
  parseEpisodeOutline,
  parseEpisodeScene,
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
    assert.equal(episodeSceneCount(30), 24);
    assert.equal(episodeSceneCount(1), 3);
    assert.equal(episodeSceneCount(500), 40);
    const messages = episodeOutlineMessages({
      premise: 'A letter arrives.',
      lead: 'Mara',
      cast: [{ name: 'Mara', sex: 'woman' }, { name: 'Lena' }],
      minutes: 30,
    });
    assert.match(messages[1]!.content, /Mara \(a woman\), Lena/);
    assert.match(messages[1]!.content, /exactly 24 scenes/);
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
    assert.match(messages[1]!.content, /Write scene 2: EXT\. STREET - DAY — She runs/);
    assert.match(messages[1]!.content, /How the scene before ended:\nMARA/);
  });
});
