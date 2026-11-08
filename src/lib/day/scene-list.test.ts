import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LOOSE_SOURCE,
  sceneListGroupSummary,
  sceneListGroups,
  sceneListSources,
  type SceneListItem,
  type SceneListScript,
} from './scene-list';

const scripts: SceneListScript[] = [
  {
    id: 'ep',
    name: 'The Last Cup',
    scenes: [
      { id: 'int-cafe-day', heading: 'INT. CAFÉ - DAY', place: 'CAFÉ' },
      { id: 'ext-beach-night', heading: 'EXT. BEACH - NIGHT', place: 'BEACH' },
    ],
  },
];

const shot = (id: string, sceneId: string, kept = false): SceneListItem => ({
  id,
  name: id,
  ...(kept ? { keptTakeId: `take-${id}` } : {}),
  fromScript: { scriptId: 'ep', sceneId },
});

const scenes: SceneListItem[] = [
  shot('1a', 'int-cafe-day', true),
  shot('1b', 'int-cafe-day'),
  shot('2a', 'ext-beach-night', true),
  { id: 'mine', name: 'By hand' },
  { id: 'gone', name: 'Old script', fromScript: { scriptId: 'deleted', sceneId: 'x' } },
  shot('cut', 'int-office-day'),
];

describe('Scene’s list', () => {
  it('lists the scripts with Scenes, then the ones made by hand (a deleted script’s too)', () => {
    assert.deepEqual(sceneListSources(scenes, scripts), [
      { id: 'ep', label: 'The Last Cup', count: 4 },
      { id: LOOSE_SOURCE, label: 'Made by hand', count: 2 },
    ]);
  });

  it('shows a script’s Scenes by its scenes, in its order, with how far each has got', () => {
    const groups = sceneListGroups({ scenes, scripts, source: 'ep', filter: 'all', flagged: new Set(['1b']) });
    assert.deepEqual(
      groups.map(group => [group.label, group.scenes.map(scene => scene.id), sceneListGroupSummary(group)]),
      [
        ['1. INT. CAFÉ - DAY', ['1a', '1b'], '1 of 2 kept · 1 to look at'],
        ['2. EXT. BEACH - NIGHT', ['2a'], '1 of 1 kept'],
        ['No longer in the script', ['cut'], '0 of 1 kept'],
      ]
    );
  });

  it('filters to what is left to do, dropping rows it empties', () => {
    const unkept = sceneListGroups({ scenes, scripts, source: 'ep', filter: 'unkept', flagged: new Set() });
    assert.deepEqual(unkept.map(group => [group.key, group.scenes.map(scene => scene.id), group.total]), [
      ['int-cafe-day', ['1b'], 2],
      ['int-office-day', ['cut'], 1],
    ]);
    const flagged = sceneListGroups({ scenes, scripts, source: 'ep', filter: 'flagged', flagged: new Set(['2a']) });
    assert.deepEqual(flagged.map(group => group.key), ['ext-beach-night']);
  });

  it('shows the Scenes made by hand as one row', () => {
    const groups = sceneListGroups({ scenes, scripts, source: LOOSE_SOURCE, filter: 'all', flagged: new Set() });
    assert.deepEqual(groups.map(group => group.scenes.map(scene => scene.id)), [['mine', 'gone']]);
  });
});
