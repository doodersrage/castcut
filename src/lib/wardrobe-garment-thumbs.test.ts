import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWardrobeGarmentThumbPrompt,
  buildWardrobeKitPickerDeck,
  resolveWardrobeGarmentThumbUrl,
  resolveWardrobeKitThumbUrl,
  selectCuratedWardrobeGarmentThumbIds,
  wardrobeGarmentThumbPlaceholderHue,
} from './wardrobe-garment-thumbs';

describe('wardrobe-garment-thumbs', () => {
  it('builds a person-free garment packshot prompt', () => {
    const prompt = buildWardrobeGarmentThumbPrompt({
      label: 'cobalt monk robes',
      script: 'boxy cobalt monk robes with rope belt',
    });
    assert.match(prompt, /cobalt monk robes/i);
    assert.match(prompt, /No person/i);
    assert.match(prompt, /ghost mannequin|flat lay/i);
    assert.match(prompt, /match the description/i);
  });

  it('stride-samples curated outfit ids', () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      id: `outfit-${String(index).padStart(2, '0')}`,
      category: 'outfit' as const,
    }));
    const picked = selectCuratedWardrobeGarmentThumbIds(entries, 4);
    assert.equal(picked.length, 4);
    assert.equal(picked[0], 'outfit-00');
    assert.ok(picked.every(id => id.startsWith('outfit-')));
  });

  it('resolves packaged thumbs from the curated manifest', () => {
    const url = resolveWardrobeGarmentThumbUrl('outfit-boxy-cobalt-monk-robes');
    assert.match(url ?? '', /\/wardrobe-thumbs\/outfit-boxy-cobalt-monk-robes\.(webp|svg)$/);
    assert.equal(resolveWardrobeGarmentThumbUrl('not-a-real-kit'), null);
  });

  it('prefers person draft over garment thumb', () => {
    assert.equal(
      resolveWardrobeKitThumbUrl({
        wardrobeId: 'outfit-boxy-cobalt-monk-robes',
        personPreviewUrl: 'blob:person',
      }),
      'blob:person'
    );
    const packaged = resolveWardrobeKitThumbUrl({
      wardrobeId: 'outfit-boxy-cobalt-monk-robes',
      personPreviewUrl: null,
    });
    assert.match(packaged ?? '', /\/wardrobe-thumbs\/outfit-boxy-cobalt-monk-robes\.(webp|svg)$/);
  });

  it('keeps selection visible in picker deck', () => {
    const options = Array.from({ length: 20 }, (_, index) => ({
      value: `kit-${index}`,
      label: `Kit ${index}`,
      group: 'Full outfits',
    }));
    const deck = buildWardrobeKitPickerDeck(options, 'kit-19', 5);
    assert.ok(deck.some(kit => kit.id === 'kit-19'));
    assert.ok(deck.length <= 5);
  });

  it('hashes placeholder hues stably', () => {
    assert.equal(
      wardrobeGarmentThumbPlaceholderHue('outfit-a'),
      wardrobeGarmentThumbPlaceholderHue('outfit-a')
    );
    assert.notEqual(
      wardrobeGarmentThumbPlaceholderHue('outfit-a'),
      wardrobeGarmentThumbPlaceholderHue('outfit-b')
    );
  });
});
