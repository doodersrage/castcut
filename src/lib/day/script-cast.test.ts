import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeScriptCastMap,
  normalizeScriptPlaceMap,
  resolvePlaces,
  resolveSpeakers,
  suggestCastFor,
} from './script-cast';
import { createScript, setScriptCastPatch, setScriptPlacePatch } from './scene-scripts';

const cast = [
  { id: 'nora', name: 'Nora Ortiz' },
  { id: 'tomas', name: 'Tomás' },
  { id: 'ines-a', name: 'Ines Avila' },
  { id: 'ines-b', name: 'Ines Brandt' },
];

describe("a script's names to records (M3 S3)", () => {
  it('suggests a Cast member by whole or first name (accents aside), never a guess between two', () => {
    assert.deepEqual(suggestCastFor('NORA ORTIZ', cast), { castId: 'nora', how: 'name' });
    assert.deepEqual(suggestCastFor('NORA', cast), { castId: 'nora', how: 'first name' });
    assert.deepEqual(suggestCastFor('TOMAS', cast), { castId: 'tomas', how: 'name' });
    assert.equal(suggestCastFor('INES', cast), null, 'two Ineses: no guess');
    assert.equal(suggestCastFor('WAITER', cast), null);
  });

  it('what you decided wins; a suggestion waits for you; a stranger stays unknown', () => {
    const parts = resolveSpeakers(['NORA', 'Tomas', 'WAITER', 'INES', 'nora'], cast, {
      TOMAS: null,
      INES: 'gone-from-cast',
    });
    assert.deepEqual(parts, [
      { speaker: 'NORA', castId: 'nora', status: 'suggested', how: 'first name' },
      { speaker: 'TOMAS', castId: null, status: 'confirmed' },
      { speaker: 'WAITER', status: 'unknown' },
      // Confirmed as someone no longer in the Cast: unknown again (two Ineses, no guess).
      { speaker: 'INES', status: 'unknown' },
    ]);
  });

  it("reads places as Castcut does, and keeps what you set", () => {
    assert.deepEqual(resolvePlaces(['KITCHEN', 'Office', 'ROOFTOP', 'kitchen'], { ROOFTOP: 'home' }), [
      { place: 'KITCHEN', choice: 'home', room: 'kitchen', status: 'suggested' },
      { place: 'OFFICE', choice: 'work', room: 'desk', status: 'suggested' },
      { place: 'ROOFTOP', choice: 'home', status: 'confirmed' },
    ]);
  });

  it('keeps decisions on the script, and clears them', () => {
    const script = createScript({ castId: 'nora', source: 'INT. KITCHEN - DAY\n\nNORA\nHi.', id: 's1', now: 1 })!;
    let cache = { scripts: [script] };
    cache = { ...cache, ...setScriptCastPatch(cache, 's1', 'nora', 'nora', 2)! };
    cache = { ...cache, ...setScriptCastPatch(cache, 's1', 'WAITER', null, 3)! };
    cache = { ...cache, ...setScriptPlacePatch(cache, 's1', 'kitchen', 'work', 4)! };
    assert.deepEqual(cache.scripts[0]!.castMap, { NORA: 'nora', WAITER: null });
    assert.deepEqual(cache.scripts[0]!.placeMap, { KITCHEN: 'work' });
    assert.equal(cache.scripts[0]!.updatedAt, 4);
    cache = { ...cache, ...setScriptCastPatch(cache, 's1', 'NORA', undefined)! };
    cache = { ...cache, ...setScriptPlacePatch(cache, 's1', 'KITCHEN', undefined)! };
    assert.deepEqual(cache.scripts[0]!.castMap, { WAITER: null });
    assert.equal(cache.scripts[0]!.placeMap, undefined);
    assert.equal(setScriptCastPatch(cache, 'missing', 'NORA', 'nora'), null);
  });

  it('cleans stored maps', () => {
    assert.deepEqual(normalizeScriptCastMap({ ' nora ': 'nora', x: 5, w: null, '': 'a' }), {
      NORA: 'nora',
      W: null,
    });
    assert.deepEqual(normalizeScriptPlaceMap({ den: 'home', roof: 'moon' }), { DEN: 'home' });
    assert.equal(normalizeScriptCastMap('junk'), undefined);
  });
});
