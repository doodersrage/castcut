import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CharacterRecord } from './os';
import { castDressedThumbUrl } from './plate-thumb';

describe('a Cast card shows her dressed (UI audit 2026-11-12)', () => {
  const slyne = {
    id: 'slyne',
    name: 'Slyne',
    version: 1,
    updatedAt: 1,
    descriptor: 'a woman',
    ipAdapter: { imageFilename: 'slyne-plate.png', imageUrl: '/plate.png' },
  } as unknown as CharacterRecord;
  const entry = (key: string, filename: string, at: number, imageUrl?: string) => ({
    key,
    filename,
    at,
    ...(imageUrl ? { imageUrl } : {}),
  });

  it('the newest dressed plate made from her own plate', () => {
    const entries = [
      entry('dress|slyne-plate.png|kit:wrap|#', 'dress-a.png', 1, '/a.png'),
      entry('dress|slyne-plate.png|kit:sweater|#', 'dress-b.png', 5),
      entry('dress|someone-else.png|kit:wrap|#', 'dress-c.png', 9, '/c.png'),
    ];
    assert.equal(
      castDressedThumbUrl(slyne, entries),
      '/api/comfyui/view?filename=dress-b.png&subfolder=&type=input'
    );
  });

  it('nothing when she has none, or no plate', () => {
    assert.equal(castDressedThumbUrl(slyne, [entry('dress|other.png|kit:x|#', 'x.png', 1)]), '');
    assert.equal(castDressedThumbUrl(null, [entry('dress|slyne-plate.png|kit:x|#', 'x.png', 1)]), '');
  });
});
