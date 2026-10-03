import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('pose library from another device', () => {
  it('folds in poses it does not have, within the limits', async () => {
    const { mergePoseLibraries } = await import('./pose-library');
    const pose = (id: string, key: string, score: number) => ({
      id,
      key,
      aspect: 0.75,
      score,
      createdAt: score,
      people: [[{ x: 0.5, y: 0.1 }]],
    });
    const merged = mergePoseLibraries([pose('a', 'sit', 0.9)] as never, [
      pose('a', 'sit', 0.9),
      pose('b', 'walk', 0.8),
      { junk: true },
    ]);
    assert.deepEqual(merged.map(entry => entry.id).sort(), ['a', 'b']);
  });
});
