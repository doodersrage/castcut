import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROLEPLAY_ARCHETYPES } from './roleplay-archetypes';

describe('ROLEPLAY_ARCHETYPES', () => {
  it('is a non-empty array', () => {
    assert.ok(Array.isArray(ROLEPLAY_ARCHETYPES));
    assert.ok(ROLEPLAY_ARCHETYPES.length > 0);
  });

  it('has unique, non-empty ids', () => {
    const ids = ROLEPLAY_ARCHETYPES.map(entry => entry.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) {
      assert.ok(id.trim().length > 0, `id "${id}" should not be blank`);
      assert.equal(id, id.trim());
    }
  });

  it('has a non-empty label and prompt for every archetype', () => {
    for (const entry of ROLEPLAY_ARCHETYPES) {
      assert.ok(entry.label.trim().length > 0, `${entry.id}: label should not be blank`);
      assert.ok(entry.prompt.trim().length > 0, `${entry.id}: prompt should not be blank`);
    }
  });

  it('has a well-formed templateBio for every archetype', () => {
    for (const entry of ROLEPLAY_ARCHETYPES) {
      const bio = entry.templateBio;
      assert.ok(bio.name.trim().length > 0, `${entry.id}: bio.name should not be blank`);
      assert.ok(bio.look.trim().length > 0, `${entry.id}: bio.look should not be blank`);
      assert.ok(bio.personality.trim().length > 0, `${entry.id}: bio.personality should not be blank`);
      if (bio.catchphrase !== undefined) {
        assert.ok(bio.catchphrase.trim().length > 0, `${entry.id}: bio.catchphrase should not be blank if present`);
      }
    }
  });

  it('has at least one non-empty templateScene per archetype', () => {
    for (const entry of ROLEPLAY_ARCHETYPES) {
      assert.ok(
        Array.isArray(entry.templateScenes) && entry.templateScenes.length > 0,
        `${entry.id}: templateScenes should be a non-empty array`
      );
      for (const scene of entry.templateScenes) {
        assert.ok(scene.title.trim().length > 0, `${entry.id}: scene title should not be blank`);
        assert.ok(scene.blurb.trim().length > 0, `${entry.id}: scene blurb should not be blank`);
      }
    }
  });
});
