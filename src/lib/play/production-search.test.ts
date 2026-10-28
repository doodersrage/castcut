import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchScore } from '../search/global-search';
import { productionSearchResults, type ProductionSearchData } from './production-search';

const data: ProductionSearchData = {
  cast: [{ id: 'cast-mara', name: 'Mara', descriptor: 'auburn hair, freckles' }],
  scenes: [
    { id: 'scene-1', castId: 'cast-mara', name: '6A CAFE · Establishing', slot: { location: 'cafe' } },
    { id: 'scene-2', castId: 'cast-mara', name: '3A PARK · Establishing' },
  ],
  scripts: [{ id: 'script-1', castId: 'cast-mara', name: 'Mara consistency set' }],
  locations: [{ id: 'loc-cafe', name: 'Corner café', look: 'green tiled counter' }],
  cutVersions: [{ id: 'v1', name: 'Reels cut' }],
};

describe('production search (M9 T1)', () => {
  it('finds a Scene and a script by name and opens them where they live', () => {
    const scenes = productionSearchResults('cafe', data, matchScore);
    assert.deepEqual(
      scenes.map(result => [result.group, result.label, result.href]),
      [['Scenes', '6A CAFE · Establishing', '/scene?character=cast-mara&scene=scene-1']]
    );
    assert.equal(scenes[0]!.subtitle, 'Mara · cafe');
    const script = productionSearchResults('consistency', data, matchScore);
    assert.deepEqual(
      script.map(result => [result.group, result.href, result.subtitle]),
      [['Scripts', '/scene?character=cast-mara&script=script-1', 'Script · Mara']]
    );
  });

  it('finds Cast, locations and Cut versions too', () => {
    const by = (query: string) =>
      productionSearchResults(query, data, matchScore).map(result => [result.group, result.href]);
    assert.deepEqual(by('mara'), [
      ['Cast', '/characters/cast-mara'],
      ['Scripts', '/scene?character=cast-mara&script=script-1'],
    ]);
    assert.deepEqual(by('corner'), [['Locations', '/scene#locations']]);
    assert.deepEqual(by('reels'), [['Cut versions', '/cut']]);
    assert.deepEqual(by('library'), []);
  });

  it('scores an exact name above a partial one', () => {
    const results = productionSearchResults('mara', data, matchScore);
    assert.equal(results.find(result => result.group === 'Cast')!.score, 100);
    assert.equal(results.find(result => result.group === 'Scripts')!.score, 80);
  });
});
