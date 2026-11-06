import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filmStyleLine, normalizeFilmStyle, normalizeShotLighting, withShotLook } from './shot-look';

describe('shot lighting and film style', () => {
  it('leaves a prompt alone when nothing is picked', () => {
    const prompt = 'SCENE: she is in the kitchen\nLIGHT: golden hour — low sun\nDay photo: she pours coffee.';
    assert.equal(withShotLook(prompt, {}), prompt);
    assert.equal(withShotLook(prompt, { lighting: 'nope', style: {} }), prompt);
  });

  it('a picked light replaces Day’s own light line where it stood', () => {
    const out = withShotLook('SCENE: kitchen\nLIGHT: golden hour — low sun\nDay photo: x.', { lighting: 'neon' });
    const lines = out.split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[1]!, /^LIGHT: coloured neon light/);
    assert.doesNotMatch(out, /golden hour/);
  });

  it('without a light line it goes after SCENE, else first', () => {
    assert.match(withShotLook('SCENE: park\nDay photo: x.', { lighting: 'overcast' }), /^SCENE: park\nLIGHT: flat soft light/);
    assert.match(withShotLook('Day photo: x.', { lighting: 'candle' }), /^LIGHT: warm flickering candlelight/);
  });

  it('the film style goes last, a ready style and own words together', () => {
    assert.equal(normalizeFilmStyle({ preset: 'bogus', words: '  ' }), undefined);
    assert.deepEqual(normalizeFilmStyle({ preset: 'film-35', words: ' warm  tones ' }), { preset: 'film-35', words: 'warm tones' });
    const line = filmStyleLine({ preset: 'film-35', words: 'warm tones' });
    assert.match(line, /^STYLE: the whole picture looks shot on 35 mm film.*; warm tones\. Her face, body and clothes stay exactly as described\.$/);
    const out = withShotLook('Day photo: x.', { style: { preset: 'mono' } });
    assert.match(out, /\nSTYLE: the whole picture looks black and white photograph/);
    assert.equal(withShotLook(out, { style: { preset: 'mono' } }), out, 'not added twice');
    assert.equal(normalizeShotLighting('golden'), 'golden');
    assert.equal(normalizeShotLighting('x'), undefined);
  });
});
