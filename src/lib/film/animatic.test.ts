import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StoryboardRow } from '../day/storyboard';
import { animaticShots } from './animatic';
import { ANIMATIC_SOURCE, activeCutSources, cutRoomSourceShots, toggledCutSources } from './cut-room';

const card = (id: string, seconds: number, sceneId?: string) => ({
  shot: { id, sceneId: 'int-cafe-day', purpose: 'action' as const, framing: 'waist' as const, who: [], seconds },
  label: id.slice(-2),
  kind: 'Action · Medium (waist up)',
  text: `beat ${id}`,
  ...(sceneId ? { sceneId } : {}),
});
const rows: StoryboardRow[] = [
  {
    scene: { id: 'int-cafe-day', heading: 'INT. CAFE - DAY', place: 'CAFE' },
    cards: [card('s~1', 3, 'scene-still'), card('s~2', 5, 'scene-clip'), card('s~3', 2), card('s~4', 4, 'scene-no-keep')],
  },
];
const kept = new Map([
  ['scene-still', { key: 'scene-still', title: 'still', url: '/still.png', kind: 'still' as const, holdSec: 3 }],
  ['scene-clip', { key: 'scene-clip', title: 'clip', url: '/clip.mp4', kind: 'clip' as const, trimStartSec: 1 }],
]);

describe('the animatic (M9 T4)', () => {
  it('plays each planned shot for its seconds: its kept take, else a card', () => {
    const drawn: string[] = [];
    const shots = animaticShots({
      rows,
      keptBySceneId: kept,
      card: text => (drawn.push(`${text.sub}: ${text.text}`), `card:${text.text}`),
    });
    assert.deepEqual(
      shots.map(shot => [shot.key, shot.url, shot.kind, shot.holdSec, shot.trimStartSec, shot.trimEndSec, shot.holdFixed]),
      [
        // Keys without "~<n>" (Cut reads that as a copy of another shot).
        ['s.1', '/still.png', 'still', 3, undefined, undefined, true],
        // A clip cut to the planned length from where it started.
        ['s.2', '/clip.mp4', 'clip', undefined, 1, 6, undefined],
        ['s.3', 'card:beat s~3', 'still', 2, undefined, undefined, true],
        // A Scene made but nothing kept: still a card.
        ['s.4', 'card:beat s~4', 'still', 4, undefined, undefined, true],
      ]
    );
    assert.deepEqual(drawn, ['~3 · Action · Medium (waist up): beat s~3', '~4 · Action · Medium (waist up): beat s~4']);
    assert.equal(shots[0]!.title, '~1 CAFE');
  });

  it('is a Cut source only when picked, and on its own', () => {
    const bySource = cutRoomSourceShots({
      scenes: [{ key: 'scene-still', title: 'a', url: '/a.png', kind: 'still' }],
      script: [{ key: 's~1', title: 'b', url: '/b.png', kind: 'still' }],
    });
    assert.deepEqual(bySource.script.map(shot => shot.key), ['script:s~1']);
    assert.deepEqual(activeCutSources(undefined, bySource), ['scenes']);
    assert.deepEqual(activeCutSources([ANIMATIC_SOURCE], bySource), ['script']);
    assert.deepEqual(toggledCutSources(['scenes'], 'script'), ['script']);
    assert.deepEqual(toggledCutSources(['script'], 'scenes'), ['scenes']);
    assert.deepEqual(toggledCutSources(['script'], 'script'), ['script'], 'never none');
    assert.deepEqual(toggledCutSources(['day', 'scenes'], 'story'), ['day', 'scenes', 'story']);
  });
});
