import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EngineHealthState } from './engine-health-engines';
import { pickRunwayClipEngine } from './outfit-runway';

const states =
  (map: Record<string, EngineHealthState>) =>
  (model: string): EngineHealthState | undefined =>
    map[model];

describe('pickRunwayClipEngine', () => {
  it('prefers MiniMax-H3, then WAN, then LTX-2.5', () => {
    const all = { 'minimax-h3': 'ready', 'wan-video-rapid-aio': 'ready', 'ltx-video-2.5': 'ready' } as const;
    assert.equal(pickRunwayClipEngine(states(all)).label, 'MiniMax-H3');
    assert.equal(
      pickRunwayClipEngine(states({ ...all, 'minimax-h3': 'missing-node' })).label,
      'WAN'
    );
    assert.equal(
      pickRunwayClipEngine(
        states({ ...all, 'minimax-h3': 'missing-model', 'wan-video-rapid-aio': 'missing-model' })
      ).label,
      'LTX-2.5'
    );
  });

  it('tries an engine it could not check before falling back to LTX-2.5', () => {
    assert.equal(
      pickRunwayClipEngine(states({ 'minimax-h3': 'missing-node' })).label,
      'WAN'
    );
    const missing = {
      'minimax-h3': 'missing-node',
      'wan-video-rapid-aio': 'missing-model',
      'ltx-video-2.5': 'missing-node',
    } as const;
    assert.equal(pickRunwayClipEngine(states(missing)).label, 'LTX-2.5');
  });
});
