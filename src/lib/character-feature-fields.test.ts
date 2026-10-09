import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeCharacterRecord, type CharacterRecord } from './character-os';
import './play-cast';

describe('Cast record feature fields', () => {
  it('survive normalising without any feature normaliser registered (no data loss)', () => {
    const record = {
      id: 'c1',
      name: 'Nora',
      version: 1,
      updatedAt: 1,
      bio: { name: 'Nora' },
      tone: 'silly',
      filmCut: { clips: [] },
      lookPacks: [{ id: 'lp1', name: 'Beach', pack: {} }],
    } as unknown as CharacterRecord;
    const normalized = normalizeCharacterRecord(record);
    assert.deepEqual(normalized.bio, { name: 'Nora' });
    assert.equal(normalized.tone, 'silly');
    assert.deepEqual(normalized.filmCut, { clips: [] });
    assert.equal(normalized.lookPacks?.length, 1);
  });
});
