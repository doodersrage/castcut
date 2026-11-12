import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SavedScene, SceneTake } from './scenes';
import type { PlannedShot } from './script-shots';
import type { ShortMoment } from './short-moments';
import { shortShotRows, shortShotSummary } from './short-shot-list';

const shot = (id: string, extra: Partial<PlannedShot> = {}): PlannedShot => ({
  id,
  sceneId: 's1',
  purpose: 'action',
  framing: 'full',
  who: ['SLYNE'],
  seconds: 4,
  ...extra,
});
const take = (id: string, extra: Partial<SceneTake> = {}) => ({ id, imageUrl: `/${id}.png`, ...extra }) as SceneTake;
const scene = (id: string, name: string, takes: SceneTake[]) =>
  ({ id, name, takes, ...(takes[0] ? { keptTakeId: takes[0].id } : {}) }) as unknown as SavedScene;

const moment = (heading: string, shots: ShortMoment['shots']): ShortMoment => ({
  sceneId: heading,
  heading,
  place: heading,
  action: [],
  lines: [],
  speakers: [],
  shots,
  loose: [],
  rendered: shots.filter(entry => entry.kept).length,
});

describe('a Short’s shot list (2026-11-12)', () => {
  const kept = take('t1', { framedUrl: '/t1-cut.png' });
  const moments = [
    moment('INT. NARROW BOOKSHOP ENTRANCE - DAY', [
      { shot: shot('a', { action: 'Slyne pulls the door closed.' }), scene: scene('sa', '1A NARROW BOOKSHOP ENTRANCE · Action', [kept]), kept },
      { shot: shot('b', { purpose: 'dialogue', framing: 'head', line: 'Typical London weather.', speaker: 'SLYNE' }), scene: scene('sb', '1B NARROW BOOKSHOP ENTRANCE · Dialogue', []) },
    ]),
    moment('INT. CRAMPED CORNER - DAY', [
      { shot: shot('c', { purpose: 'dialogue', framing: 'waist', who: ['SLYNE', 'MR. HARRIS'], line: 'Apologies, dear.', speaker: 'MR. HARRIS', offscreen: true }), scene: scene('sc', '2A CRAMPED CORNER · Dialogue', [take('t2'), take('t3')]), kept: take('t2') },
      { shot: shot('d', { seconds: 100 }) },
    ]),
  ];

  it('one row a shot in script order, with its slate, size, who and words', () => {
    const rows = shortShotRows(moments, { sc: 'realism 4/10' });
    assert.deepEqual(
      rows.map(row => [row.label, row.size, row.purpose, row.status, row.takes]),
      [
        ['1A', 'Wide', 'Action', 'kept', 1],
        ['1B', 'Close-up', 'Dialogue', 'no-take', 0],
        ['2A', 'Medium', 'Dialogue', 'to-check', 2],
        // Not made into a Scene: its slate from the order.
        ['2B', 'Wide', 'Action', 'not-made', 0],
      ]
    );
    assert.equal(rows[0]!.thumb, '/t1-cut.png');
    assert.equal(rows[0]!.text, 'Slyne pulls the door closed.');
    assert.equal(rows[1]!.text, 'Slyne: Typical London weather.');
    assert.equal(rows[2]!.text, 'Mr Harris (V.O.): Apologies, dear.');
    assert.equal(rows[2]!.who, 'Slyne, Mr Harris');
    assert.equal(rows[2]!.why, 'realism 4/10');
    assert.equal(rows[3]!.sceneId, undefined);
  });

  it('sums it up with only what is there', () => {
    assert.equal(
      shortShotSummary(shortShotRows(moments, { sc: 'x' })),
      '4 shots · 1 kept · 1 to check · 1 no take yet · 1 not made · about 2 min'
    );
    assert.equal(shortShotSummary([]), '0 shots');
  });
});
